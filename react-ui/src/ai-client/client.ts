/**
 * AI Client for Frontend
 * Communicates with the AI Server (agent-server) for chat and tool execution.
 */

import { ChatRequest, ChatResponse, FunctionResultRequest, StreamingChatOptions, StreamEvent, StreamError } from './types';
import { attemptWithRefresh } from '../auth/fetchWithRefresh';

export interface AIClientConfig {
  baseURL: string;
  timeout?: number;
  accessToken?: string;
}

export class AIClient {
  private baseURL: string;
  private timeout: number;
  private accessToken: string | null;

  constructor(config: AIClientConfig) {
    this.baseURL = config.baseURL;
    // Increased timeout for AI operations (chat requests can take longer due to OpenAI API calls)
    // Default: 120 seconds (2 minutes) for chat, 30 seconds for other operations
    this.timeout = config.timeout || 120000; // 2 minutes default for chat operations
    this.accessToken = config.accessToken || null;
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private buildAuthHeaders(token?: string | null): Record<string, string> {
    const t = token ?? this.accessToken;
    if (!t) return {};
    return { Authorization: `Bearer ${t}` };
  }

  /**
   * Send chat message to AI server
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await attemptWithRefresh((token) =>
        fetch(`${this.baseURL}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(token),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }),
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout / 1000}s. The AI is processing your request - this may take longer for complex queries.`);
      }
      throw error;
    }
  }

  /**
   * Send chat message to AI server (streaming).
   * Pass an AbortSignal to allow the caller to stop the stream (e.g. user clicked Stop).
   */
  async chatStream(
    request: ChatRequest,
    options: StreamingChatOptions,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const response = await attemptWithRefresh((token) =>
        fetch(`${this.baseURL}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(token),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }),
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        options.onError?.({
          type: 'error',
          error: error.error || `HTTP ${response.status}`
        });
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamEvent;

              switch (data.type) {
                case 'start':
                  // Server sent connection confirmation; stream is ready
                  break;
                case 'chunk':
                  options.onChunk?.(data);
                  break;
                case 'narration':
                  options.onNarration?.(data);
                  break;
                case 'reasoning':
                  options.onReasoning?.(data);
                  break;
                case 'function_call':
                  options.onFunctionCall?.(data);
                  break;
                case 'tool_execution':
                  options.onToolExecution?.(data);
                  break;
                case 'tool_results':
                  options.onToolResult?.(data);
                  break;
                case 'state_update':
                  options.onStateUpdate?.(data);
                  break;
                case 'complete':
                  options.onComplete?.(data);
                  break;
                case 'error':
                  options.onError?.(data);
                  break;
                case 'done':
                  options.onDone?.();
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Process any remaining buffer after stream ends
      // This fixes the issue where the last SSE event (e.g., 'complete') is not processed
      // if it doesn't have a trailing \n\n
      if (buffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.trim().slice(6)) as StreamEvent;
          switch (data.type) {
            case 'complete':
              options.onComplete?.(data);
              break;
            case 'error':
              options.onError?.(data);
              break;
            case 'done':
              options.onDone?.();
              break;
          }
        } catch (e) {
          console.error('Failed to parse remaining buffer:', e);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (signal?.aborted) {
          throw new Error('Stopped');
        }
        const streamError: StreamError = {
          type: 'error',
          error: `Request timeout after ${this.timeout / 1000}s. The AI is processing your request - this may take longer for complex queries.`
        };
        options.onError?.(streamError);
        throw new Error(streamError.error);
      }
      throw error;
    }
  }

  /**
   * Continue chat after function execution
   */
  async continueChat(request: FunctionResultRequest): Promise<ChatResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await attemptWithRefresh((token) =>
        fetch(`${this.baseURL}/api/v1/chat/continue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(token),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }),
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout / 1000}s. The AI is processing your request - this may take longer for complex queries.`);
      }
      throw error;
    }
  }

  /**
   * Check server health
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Continue chat after function execution (streaming).
   * Pass an AbortSignal to allow the caller to stop the stream.
   */
  async continueChatStream(
    request: FunctionResultRequest,
    options: StreamingChatOptions,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const response = await attemptWithRefresh((token) =>
        fetch(`${this.baseURL}/api/v1/chat/continue/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(token),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }),
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        options.onError?.({
          type: 'error',
          error: error.error || `HTTP ${response.status}`
        });
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE messages
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamEvent;

              switch (data.type) {
                case 'start':
                  break;
                case 'chunk':
                  options.onChunk?.(data);
                  break;
                case 'function_call':
                  options.onFunctionCall?.(data);
                  break;
                case 'complete':
                  options.onComplete?.(data);
                  break;
                case 'error':
                  options.onError?.(data);
                  break;
                case 'done':
                  options.onDone?.();
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      // Process any remaining buffer after stream ends
      // This fixes the issue where the last SSE event (e.g., 'complete') is not processed
      // if it doesn't have a trailing \n\n
      if (buffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.trim().slice(6)) as StreamEvent;
          switch (data.type) {
            case 'complete':
              options.onComplete?.(data);
              break;
            case 'error':
              options.onError?.(data);
              break;
            case 'done':
              options.onDone?.();
              break;
          }
        } catch (e) {
          console.error('Failed to parse remaining buffer:', e);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (signal?.aborted) {
          throw new Error('Stopped');
        }
        const streamError: StreamError = {
          type: 'error',
          error: `Request timeout after ${this.timeout / 1000}s. The AI is processing your request - this may take longer for complex queries.`
        };
        options.onError?.(streamError);
        throw new Error(streamError.error);
      }
      throw error;
    }
  }

  /**
   * Register a user with the knowledge base
   * Ensures file watcher is active for the user's directory
   */
  async registerUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const controller = new AbortController();
      // Use shorter timeout for registration (30 seconds)
      const registrationTimeout = 30000;
      const timeoutId = setTimeout(() => controller.abort(), registrationTimeout);

      const response = await attemptWithRefresh((token) =>
        fetch(`${this.baseURL}/api/v1/knowledge-base/register-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.buildAuthHeaders(token),
          },
          body: JSON.stringify({ userId }),
          signal: controller.signal,
        }),
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${30}s`);
      }
      throw error;
    }
  }
}



