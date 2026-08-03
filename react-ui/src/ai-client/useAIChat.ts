/**
 * React Hook for AI Chat Integration
 *
 * Simplifies chat interactions with the AI server.
 * Tool execution is handled by mcp-server - results come via SSE events.
 */

import { useState, useCallback, useRef } from 'react';
import { AIClient } from './client';
import { ChatRequest, ChatMessage, ChatResponse, StreamNarration } from './types';
// StreamReasoning imported for type checking via onReasoning callback

export interface BrainToolStatus {
  call_id: string;
  name: string;
  status: 'running' | 'success' | 'failed';
  error?: string;
}

export interface BrainRound {
  round: number;
  tools: BrainToolStatus[];
  reasoning?: string;
}

export interface UseAIChatOptions {
  baseURL: string;
  autoExecuteFunctions?: boolean;
  accessToken?: string | null;
}

export function useAIChat(options: UseAIChatOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [brainRounds, setBrainRounds] = useState<BrainRound[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState<string>('');
  const currentRoundReasoningRef = useRef<string>('');
  const allRoundsReasoningRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use accessToken from options (passed from AuthProvider via AIAssistant)
  // This ensures the AI client always has the latest token
  const accessToken = options.accessToken;
  const clientRef = useRef<AIClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new AIClient({
      baseURL: options.baseURL,
      accessToken: accessToken || undefined,
    });
  } else {
    clientRef.current.setAccessToken(accessToken || null);
  }
  const client = clientRef.current;

  /**
   * Send a chat message with streaming support
   * Tool execution is handled by mcp-server - results come via tool_results SSE event
   */
  const sendMessageStream = useCallback(async (
    userMessage: string,
    context?: ChatRequest['context'],
    callbacks?: {
      onChunk?: (chunk: string) => void;
      onFunctionCall?: (call: { name: string; arguments: string }) => void;
      onToolResults?: (results: Array<{ call_id: string; name: string; success: boolean; error?: string }>) => void;
    }
  ) => {
    const { onChunk, onFunctionCall, onToolResults } = callbacks || {};
    setLoading(true);
    setError(null);
    setIsStreaming(true);
    setStreamingMessage('');
    setBrainRounds([]);
    setStreamingReasoning('');
    currentRoundReasoningRef.current = '';
    allRoundsReasoningRef.current = '';

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      // Merge provided context with defaults
      const requestContext: ChatRequest['context'] = {
        currentSession: context?.currentSession,
        userId: context?.userId,
        availableFiles: context?.availableFiles || [],
        useKnowledgeBase: context?.useKnowledgeBase ?? false,
      };

      // Add user message to conversation
      const userMsg: ChatMessage = {
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Send chat request
      const request: ChatRequest = {
        messages: updatedMessages,
        context: requestContext
      };

      // Streaming chat function
      const streamChat = async (chatRequest: ChatRequest, abortSignal: AbortSignal): Promise<ChatResponse> => {
        return new Promise((resolve, reject) => {
          const functionCalls: { name: string; arguments: string; call_id: string }[] = [];

          client.chatStream(chatRequest, {
            onChunk: (chunk) => {
              setStreamingMessage(chunk.content);
              setMessages((prev) => {
                const content = chunk.content;
                const last = prev[prev.length - 1];
                // Only update the last message if it's a plain text assistant bubble.
                // If it already has a function_call (finished round), start a new bubble.
                if (last?.role === 'assistant' && typeof last.content === 'string' && !last.function_call) {
                  return [...prev.slice(0, -1), { ...last, content, isNarration: false }];
                }
                return [...prev, { role: 'assistant', content, isNarration: false }];
              });
              onChunk?.(chunk.delta);
            },
            onNarration: (narration: StreamNarration) => {
              // Model switched from reasoning to narrating; clear streaming reasoning
              currentRoundReasoningRef.current = '';
              setStreamingReasoning('');
              setMessages((prev) => {
                const content = narration.content;
                const last = prev[prev.length - 1];
                // Narration always starts a fresh bubble (previous round's bubble has function_call)
                if (last?.role === 'assistant' && typeof last.content === 'string' && !last.function_call) {
                  return [...prev.slice(0, -1), { ...last, content, isNarration: true }];
                }
                return [...prev, { role: 'assistant', content, isNarration: true }];
              });
            },
            onReasoning: (reasoning) => {
              // Accumulate reasoning using delta for current round
              currentRoundReasoningRef.current += reasoning.delta;
              // Display: all previous rounds + current round (accumulated)
              const displayReasoning = allRoundsReasoningRef.current 
                ? `${allRoundsReasoningRef.current}\n${currentRoundReasoningRef.current}`
                : currentRoundReasoningRef.current;
              setStreamingReasoning(displayReasoning);
            },
            onFunctionCall: (call) => {
              const existingCall = functionCalls.find(fc => fc.call_id === call.call_id);
              if (existingCall) {
                existingCall.arguments = call.arguments || '';
              } else {
                functionCalls.push({
                  name: call.name,
                  arguments: call.arguments || '',
                  call_id: call.call_id
                });
              }
              onFunctionCall?.({ name: call.name, arguments: call.arguments || '' });
            },
            onToolExecution: (execution) => {
              // Move current round's reasoning to all rounds
              if (currentRoundReasoningRef.current) {
                allRoundsReasoningRef.current = allRoundsReasoningRef.current 
                  ? `${allRoundsReasoningRef.current}\n${currentRoundReasoningRef.current}`
                  : currentRoundReasoningRef.current;
              }
              currentRoundReasoningRef.current = '';
              
              // Update streamingReasoning to show all accumulated reasoning (persists in UI)
              setStreamingReasoning(allRoundsReasoningRef.current);

              // Track round in brainRounds state
              setBrainRounds(prev => [
                ...prev,
                {
                  round: execution.round,
                  tools: execution.tools.map(t => ({
                    call_id: t.call_id,
                    name: t.name,
                    status: 'running' as const,
                  })),
                  reasoning: currentRoundReasoningRef.current || undefined,
                },
              ]);
              // Attach the function_call badge to the last assistant message.
              // If it already has one (aggregated round) update it; if it has narration
              // text (or is empty) merge in the badge so text + status share one bubble.
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                const currentTool = execution.tools[0];
                const fnCall = {
                  name: currentTool?.name || 'unknown',
                  arguments: JSON.stringify({ round: execution.round, call_id: currentTool?.call_id }),
                };
                if (last?.role === 'assistant') {
                  // If text content was already streamed, it was narration — mark it
                  const isNarration = !!(last.content && last.content.trim());
                  return [...prev.slice(0, -1), { ...last, function_call: fnCall, isNarration }];
                }
                return [...prev, { role: 'assistant' as const, content: '', function_call: fnCall }];
              });
            },
            onToolResult: (result) => {
              // Update last round's tool statuses
              setBrainRounds(prev => {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                const updatedTools = last.tools.map(tool => {
                  const r = result.results.find(r => r.call_id === tool.call_id);
                  if (!r) return tool;
                  return { ...tool, status: r.success ? 'success' as const : 'failed' as const, error: r.error };
                });
                return [...prev.slice(0, -1), { ...last, tools: updatedTools }];
              });
              if (onToolResults && result.results) {
                const resultsWithNames = result.results.map(r => ({
                  call_id: r.call_id,
                  name: r.name || functionCalls.find(f => f.call_id === r.call_id)?.name || 'unknown',
                  success: r.success,
                  error: r.error,
                  result: r.result,
                }));
                onToolResults(resultsWithNames);
              }
            },
            onComplete: (complete) => {
              setStreamingReasoning('');
              currentRoundReasoningRef.current = '';
              allRoundsReasoningRef.current = '';
              resolve({
                success: true,
                message: complete.message,
                functionCalls: undefined,
                requiresFunctionExecution: false,
                forceTextApplied: complete.forceTextApplied
              });
            },
            onError: (error) => {
              reject(new Error(error.error));
            },
            onDone: () => {
              // Stream complete
            }
          }, abortSignal).catch(reject);
        });
      };

      const response = await streamChat(request, signal);

      if (!response.success) {
        throw new Error(response.error || 'Chat request failed');
      }

      return response;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Stopped') {
        setError(null);
        setStreamingMessage(null);
        return;
      }
      const errorMessage = err.message || 'Failed to send message';
      setError(errorMessage);
      setStreamingMessage(null);
      throw err;
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      setIsStreaming(false);
      setTimeout(() => setStreamingMessage(null), 0);
    }
  }, [client, messages]);

  /** Stop the current message (streaming or tool calling) */
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    // Remove trailing tool-call-only assistant messages
    setMessages((prev) => {
      const next = [...prev];
      while (next.length > 0) {
        const last = next[next.length - 1];
        const isToolCallOnly =
          last.role === 'assistant' &&
          last.function_call &&
          (!last.content || String(last.content).trim() === '');
        if (!isToolCallOnly) break;
        next.pop();
      }
      return next;
    });
  }, []);

  /**
   * Clear conversation history
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  /**
   * Check AI server health
   */
  const healthCheck = useCallback(async () => {
    try {
      return await client.healthCheck();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [client]);

  return {
    // State
    loading,
    error,
    messages,
    streamingMessage,
    isStreaming,
    brainRounds,
    streamingReasoning,

    // Actions
    sendMessageStream,
    stopGeneration,
    clearMessages,
    healthCheck,

    // Utilities
    clearError: () => setError(null)
  };
}
