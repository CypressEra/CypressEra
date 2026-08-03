/**
 * OpenAI Client for Function Calling
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ChatMessage, type LLMClient, type LLMStreamEvent, type LLMFunctionCall } from '../core/types/index.js';
import { getOpenAITools } from './sdkFunctions.js';

/**
 * Parse XML-style tool calls from content (generic format used by various models)
 * Supports multiple XML formats:
 * - MiniMax: <minimax:tool_call><invoke name="..."><parameter name="...">...</parameter></invoke></minimax:tool_call>
 * - Generic: <function_calls><invoke name="..."><parameter name="...">...</parameter></invoke></function_calls>
 * - Anthropic: <function_calls><invoke><tool_name>...</tool_name><parameters>...</parameters></invoke></function_calls>
 * - Other: <function name="..."><arguments>...</arguments></function>
 */
function parseXMLToolCalls(content: string): Array<{ name: string; arguments: Record<string, unknown> }> | null {
  // Check if content contains any XML tool call format
  if (!content.includes('<minimax:tool_call>') &&
      !content.includes('<function_calls>') &&
      !content.includes('<invoke') &&
      !content.includes('<function name=')) {
    return null;
  }

  const results: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  let match;

  // Pattern 1: <invoke name="..."><parameter name="...">...</parameter></invoke>
  const invokeRegex = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/g;

  while ((match = invokeRegex.exec(content)) !== null) {
    const name = match[1];
    const paramsBlock = match[2];
    const args: Record<string, unknown> = {};

    // Parse parameters: <parameter name="...">...</parameter>
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(paramsBlock)) !== null) {
      const paramName = paramMatch[1];
      let paramValue: string = paramMatch[2].trim();
      args[paramName] = parseValue(paramValue);
    }

    results.push({ name, arguments: args });
  }

  // Pattern 2: <function name="...">...</function>
  const functionRegex = /<function\s+name="([^"]+)">([\s\S]*?)<\/function>/g;
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1];
    const argsBlock = match[2];
    const args: Record<string, unknown> = {};

    // Try to parse as JSON arguments first
    const argsMatch = argsBlock.match(/<arguments>([\s\S]*?)<\/arguments>/);
    if (argsMatch) {
      try {
        const parsed = JSON.parse(argsMatch[1].trim());
        if (typeof parsed === 'object') {
          results.push({ name, arguments: parsed });
          continue;
        }
      } catch {
        // Fall through to parameter parsing
      }
    }

    // Parse parameters: <parameter name="...">...</parameter>
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(argsBlock)) !== null) {
      const paramName = paramMatch[1];
      let paramValue: string = paramMatch[2].trim();
      args[paramName] = parseValue(paramValue);
    }

    if (Object.keys(args).length > 0) {
      results.push({ name, arguments: args });
    }
  }

  // Pattern 3: <tool_name>...</tool_name><parameters>...</parameters>
  const toolNameRegex = /<tool_name>([^<]+)<\/tool_name>\s*<parameters>([\s\S]*?)<\/parameters>/g;
  while ((match = toolNameRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const paramsBlock = match[2];
    const args: Record<string, unknown> = {};

    // Try to parse parameters as JSON
    try {
      const parsed = JSON.parse(paramsBlock.trim());
      if (typeof parsed === 'object') {
        results.push({ name, arguments: parsed });
        continue;
      }
    } catch {
      // Fall through to parameter parsing
    }

    // Parse individual parameters
    const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let paramMatch;

    while ((paramMatch = paramRegex.exec(paramsBlock)) !== null) {
      const paramName = paramMatch[1];
      let paramValue: string = paramMatch[2].trim();
      args[paramName] = parseValue(paramValue);
    }

    if (Object.keys(args).length > 0) {
      results.push({ name, arguments: args });
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Parse a string value, attempting JSON parsing if applicable
 */
function parseValue(value: string): unknown {
  const trimmed = value.trim();

  // Try to parse as JSON if it looks like JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      trimmed === 'true' || trimmed === 'false' ||
      trimmed === 'null' ||
      !isNaN(Number(trimmed))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Return as string if JSON parsing fails
    }
  }

  return trimmed;
}

/**
 * Split a streaming content chunk into reasoning (inside <think>…</think>) and text parts.
 * Handles partial tags across multiple chunks via the `insideTag` state.
 */
function extractThinkTags(
  content: string,
  insideTag: boolean
): { parts: Array<{ text: string; isReasoning: boolean }>; endsInTag: boolean } {
  const parts: Array<{ text: string; isReasoning: boolean }> = [];
  let remaining = content;
  let inside = insideTag;

  while (remaining.length > 0) {
    if (inside) {
      const end = remaining.indexOf('</think>');
      if (end === -1) {
        parts.push({ text: remaining, isReasoning: true });
        remaining = '';
      } else {
        if (end > 0) parts.push({ text: remaining.slice(0, end), isReasoning: true });
        inside = false;
        remaining = remaining.slice(end + '</think>'.length);
      }
    } else {
      const start = remaining.indexOf('<think>');
      if (start === -1) {
        parts.push({ text: remaining, isReasoning: false });
        remaining = '';
      } else {
        if (start > 0) parts.push({ text: remaining.slice(0, start), isReasoning: false });
        inside = true;
        remaining = remaining.slice(start + '<think>'.length);
      }
    }
  }

  return { parts, endsInTag: inside };
}

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini', baseUrl?: string) {
    // Auto-detect proxy from environment (don't default to hardcoded proxy)
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 
                     process.env.https_proxy || process.env.http_proxy;
    
    const clientOptions: any = { apiKey };
    
    // Add base URL if provided (for non-OpenAI providers like Tencent Coding)
    if (baseUrl) {
      clientOptions.baseURL = baseUrl;
      console.log('[OpenAIClient] 🌐 Using custom base URL:', baseUrl);
    }
    
    // Configure proxy only if explicitly set in environment
    if (proxyUrl) {
      try {
        clientOptions.httpAgent = new HttpsProxyAgent(proxyUrl);
        console.log('[OpenAIClient] 🔀 Using proxy:', proxyUrl.replace(/:[^:@]*@/, ':****@'));
      } catch (error) {
        console.warn('[OpenAIClient] ⚠️  Failed to configure proxy:', error);
        // Continue without proxy if proxy setup fails
      }
    } else {
      console.log('[OpenAIClient] 🌐 No proxy configured, using direct connection');
    }
    
    this.client = new OpenAI(clientOptions);
    this.model = model;
  }

  /**
   * Get the underlying OpenAI client (for supervisor-executor flow)
   */
  getOpenAI(): OpenAI {
    return this.client;
  }

  /**
   * Get the model name
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Chat with OpenAI and handle function calling (non-streaming)
   */
  async chat(messages: ChatMessage[]): Promise<{
    message?: string;
    functionCalls?: Array<{
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;
    finishReason: string;
  }> {
    const tools = getOpenAITools();

    try {
      // Use the responses API (newer format) if available, otherwise fall back to chat.completions
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any,
        tools: tools as any,
        tool_choice: 'auto'
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      const message = choice.message;
      const finishReason = choice.finish_reason || 'stop';

      // Check for function calls (tool calls)
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const functionCalls = message.tool_calls.map(toolCall => ({
          id: toolCall.id,
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        }));

        return {
          message: message.content || undefined, // preserve narration text alongside tool calls
          functionCalls,
          finishReason: 'tool_calls'
        };
      }

      // Regular text response
      return {
        message: message.content || '',
        finishReason
      };
    } catch (error: any) {
      console.error('[OpenAIClient] Error details:', {
        message: error.message,
        code: error.code,
        status: error.status,
        type: error.constructor.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      });
      
      // Provide more helpful error messages
      if (error.message?.includes('Connection') || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`OpenAI API connection failed: ${error.message}. Check your network connection and proxy settings.`);
      }
      if (error.status === 401) {
        throw new Error(`OpenAI API authentication failed: Invalid API key. Please check your OPENAI_API_KEY.`);
      }
      if (error.status === 429) {
        throw new Error(`OpenAI API rate limit exceeded: ${error.message}`);
      }
      
      throw new Error(`OpenAI API error: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Streaming chat conforming to LLMClient interface.
   * Yields text_delta events as tokens arrive and a final done event.
   */
  async *chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<LLMStreamEvent> {
    const tools = getOpenAITools();
    let accumulated = '';
    let reasoningAccumulated = '';
    let inThinkTag = false;
    const fcMap = new Map<string, LLMFunctionCall>();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any,
        tools: tools as any,
        tool_choice: 'auto',
        stream: true,
      });

      for await (const chunk of stream) {
        if (signal?.aborted) return;
        const delta = chunk.choices[0]?.delta as any;
        const finishReason = chunk.choices[0]?.finish_reason;

        // DeepSeek R1 / GLM-Z1: reasoning_content field
        // StepFun step-3.5-flash: reasoning field
        const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
        if (reasoningDelta) {
          reasoningAccumulated += reasoningDelta;
          yield { type: 'reasoning_delta', delta: reasoningDelta, accumulated: reasoningAccumulated };
        }

        if (delta?.content) {
          // QwQ / Qwen-style: reasoning wrapped in <think>…</think> inside content
          const events = extractThinkTags(delta.content, inThinkTag);
          inThinkTag = events.endsInTag;
          for (const ev of events.parts) {
            if (ev.isReasoning) {
              reasoningAccumulated += ev.text;
              yield { type: 'reasoning_delta', delta: ev.text, accumulated: reasoningAccumulated };
            } else if (ev.text) {
              accumulated += ev.text;
              yield { type: 'text_delta', delta: ev.text, accumulated };
            }
          }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const key = (tc.index ?? 0).toString();
            if (!fcMap.has(key)) {
              fcMap.set(key, { id: tc.id || key, call_id: tc.id || key, name: '', arguments: '' });
            }
            const fc = fcMap.get(key)!;
            if (tc.id) { fc.id = tc.id; fc.call_id = tc.id; }
            if (tc.function?.name) fc.name += tc.function.name;
            if (tc.function?.arguments) fc.arguments += tc.function.arguments;
          }
        }

        if (finishReason) {
          const functionCalls = fcMap.size > 0 ? Array.from(fcMap.values()) : undefined;
          yield { type: 'done', message: accumulated, functionCalls, reasoning: reasoningAccumulated || undefined };
          return;
        }
      }
    } catch (error: any) {
      if (signal?.aborted) return;
      throw new Error(`OpenAI streaming error: ${error.message}`);
    }
  }

  /**
   * Chat with OpenAI and handle function calling (streaming) — legacy method for old executor flow
   * Returns an AsyncGenerator that yields streaming events
   */
  async *chatStreamLegacy(messages: ChatMessage[]): AsyncGenerator<{
    type: 'chunk' | 'function_call' | 'complete' | 'error';
    content?: string;
    delta?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    message?: string;
    functionCalls?: Array<{
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;
    requiresFunctionExecution?: boolean;
    finishReason?: string;
    error?: string;
  }> {
    const tools = getOpenAITools();
    let accumulatedContent = '';
    const functionCalls: Map<string, { id: string; name: string; arguments: string }> = new Map();

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any,
        tools: tools as any,
        tool_choice: 'auto',
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        // Check for tool calls
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index ?? 0;
            const id = toolCall.id;
            const functionName = toolCall.function?.name;
            const functionArgs = toolCall.function?.arguments;

            if (id) {
              if (!functionCalls.has(index.toString())) {
                functionCalls.set(index.toString(), { id, name: '', arguments: '' });
                yield {
                  type: 'function_call',
                  call_id: id,
                  name: '',
                  arguments: ''
                };
              } else {
                functionCalls.get(index.toString())!.id = id;
              }
            }

            if (functionName) {
              const call = functionCalls.get(index.toString());
              if (call) {
                call.name = functionName;
                yield {
                  type: 'function_call',
                  call_id: call.id,
                  name: functionName,
                  arguments: call.arguments
                };
              }
            }

            if (functionArgs) {
              const call = functionCalls.get(index.toString());
              if (call) {
                call.arguments += functionArgs;
                yield {
                  type: 'function_call',
                  call_id: call.id,
                  name: call.name,
                  arguments: call.arguments
                };
              }
            }
          }
        } else if (delta?.content) {
          // Text content
          accumulatedContent += delta.content;
          yield {
            type: 'chunk',
            content: accumulatedContent,
            delta: delta.content
          };
        }

        // Check if stream is finished
        if (finishReason) {
          let hasFunctionCalls = functionCalls.size > 0;
          let finalContent = accumulatedContent;

          // If no standard function calls, check for XML tool call format
          if (!hasFunctionCalls && accumulatedContent) {
            console.log('[OpenAIClient] 🔍 Checking for XML tool calls in content:', accumulatedContent.substring(0, 200));
            const xmlCalls = parseXMLToolCalls(accumulatedContent);
            if (xmlCalls) {
              console.log('[OpenAIClient] 📋 Parsed XML tool calls:', JSON.stringify(xmlCalls, null, 2));
              hasFunctionCalls = true;
              // Add parsed calls to functionCalls map
              xmlCalls.forEach((call, index) => {
                const id = `xml_${index}_${Date.now()}`;
                functionCalls.set(index.toString(), {
                  id,
                  name: call.name,
                  arguments: JSON.stringify(call.arguments)
                });
              });
              // Clear content since we have tool calls
              finalContent = '';
            } else {
              console.log('[OpenAIClient] ❌ No XML tool calls found');
            }
          }

          yield {
            type: 'complete',
            message: !hasFunctionCalls ? finalContent : undefined,
            functionCalls: hasFunctionCalls ? Array.from(functionCalls.values()).map(fc => ({
              id: fc.id,
              call_id: fc.id,
              name: fc.name,
              arguments: fc.arguments || '{}'
            })) : undefined,
            requiresFunctionExecution: hasFunctionCalls,
            finishReason
          };
          break;
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message || 'Streaming error occurred'
      };
    }
  }

  /**
   * Continue chat after function execution (streaming)
   * Returns an AsyncGenerator that yields streaming events
   */
  async *continueChatStream(
    messages: ChatMessage[],
    functionResults: Array<{
      call_id: string;
      result: any;
      error?: string;
    }>,
    options?: { forceTextResponse?: boolean }
  ): AsyncGenerator<{
    type: 'chunk' | 'function_call' | 'complete' | 'error';
    content?: string;
    delta?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    message?: string;
    functionCalls?: Array<{
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;
    requiresFunctionExecution?: boolean;
    forceTextApplied?: boolean;
    finishReason?: string;
    error?: string;
  }> {
    const tools = getOpenAITools();
    const forceText = options?.forceTextResponse === true;
    let accumulatedContent = '';
    const functionCalls: Map<string, { id: string; name: string; arguments: string }> = new Map();

    // Convert messages to OpenAI format (same logic as non-streaming)
    const updatedMessages: any[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg: any = messages[i];
      const hasFunctionCall = msg.function_call !== undefined && msg.function_call !== null;

      if (msg.role === 'assistant' && hasFunctionCall) {
        const functionCall = msg.function_call;
        if (!functionResults || functionResults.length === 0) {
          yield { type: 'error', error: 'No function results provided' };
          return;
        }

        const matchingResult = functionResults[0];
        const toolCallId = matchingResult.call_id;

        updatedMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: functionCall.name,
              arguments: functionCall.arguments
            }
          }]
        });

        updatedMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(matchingResult.error ? { error: matchingResult.error } : matchingResult.result)
        });
      } else if (msg.role !== 'tool') {
        updatedMessages.push({
          role: msg.role,
          content: msg.content || (msg.role === 'assistant' ? null : undefined),
          name: msg.name
        });
      }
    }

    // Add any remaining function results
    const addedCallIds = new Set(
      updatedMessages
        .filter(m => m.role === 'tool')
        .map(m => m.tool_call_id)
    );

    for (const result of functionResults) {
      if (!addedCallIds.has(result.call_id)) {
        const lastAssistantMsg = [...updatedMessages]
          .reverse()
          .find(m => m.role === 'assistant' && m.tool_calls);

        if (lastAssistantMsg && lastAssistantMsg.tool_calls) {
          const toolCallId = lastAssistantMsg.tool_calls[lastAssistantMsg.tool_calls.length - 1]?.id || result.call_id;
          updatedMessages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: JSON.stringify(result.error ? { error: result.error } : result.result)
          });
        }
      }
    }

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: updatedMessages,
        tools: tools as any,
        tool_choice: forceText ? ('none' as const) : 'auto',
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const finishReason = chunk.choices[0]?.finish_reason;

        // Check for tool calls
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index ?? 0;
            const id = toolCall.id;
            const functionName = toolCall.function?.name;
            const functionArgs = toolCall.function?.arguments;

            if (id) {
              if (!functionCalls.has(index.toString())) {
                functionCalls.set(index.toString(), { id, name: '', arguments: '' });
                yield {
                  type: 'function_call',
                  call_id: id,
                  name: '',
                  arguments: ''
                };
              } else {
                functionCalls.get(index.toString())!.id = id;
              }
            }

            if (functionName) {
              const call = functionCalls.get(index.toString());
              if (call) {
                call.name = functionName;
                yield {
                  type: 'function_call',
                  call_id: call.id,
                  name: functionName,
                  arguments: call.arguments
                };
              }
            }

            if (functionArgs) {
              const call = functionCalls.get(index.toString());
              if (call) {
                call.arguments += functionArgs;
                yield {
                  type: 'function_call',
                  call_id: call.id,
                  name: call.name,
                  arguments: call.arguments
                };
              }
            }
          }
        } else if (delta?.content) {
          // Text content
          accumulatedContent += delta.content;
          yield {
            type: 'chunk',
            content: accumulatedContent,
            delta: delta.content
          };
        }

        // Check if stream is finished
        if (finishReason) {
          let hasFunctionCalls = functionCalls.size > 0;
          let finalContent = accumulatedContent;

          // If no standard function calls, check for XML tool call format
          if (!hasFunctionCalls && accumulatedContent) {
            console.log('[OpenAIClient] 🔍 Checking for XML tool calls in content:', accumulatedContent.substring(0, 200));
            const xmlCalls = parseXMLToolCalls(accumulatedContent);
            if (xmlCalls) {
              console.log('[OpenAIClient] 📋 Parsed XML tool calls:', JSON.stringify(xmlCalls, null, 2));
              hasFunctionCalls = true;
              // Add parsed calls to functionCalls map
              xmlCalls.forEach((call, index) => {
                const id = `xml_${index}_${Date.now()}`;
                functionCalls.set(index.toString(), {
                  id,
                  name: call.name,
                  arguments: JSON.stringify(call.arguments)
                });
              });
              // Clear content since we have tool calls
              finalContent = '';
            } else {
              console.log('[OpenAIClient] ❌ No XML tool calls found');
            }
          }

          yield {
            type: 'complete',
            message: !hasFunctionCalls ? finalContent : undefined,
            functionCalls: hasFunctionCalls ? Array.from(functionCalls.values()).map(fc => ({
              id: fc.id,
              call_id: fc.id,
              name: fc.name,
              arguments: fc.arguments || '{}'
            })) : undefined,
            requiresFunctionExecution: hasFunctionCalls,
            forceTextApplied: forceText,
            finishReason
          };
          break;
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: error.message || 'Streaming error occurred'
      };
    }
  }

  /**
   * Continue chat after function execution (non-streaming)
   * @param options.forceTextResponse - when true, use tool_choice: 'none' so the model must respond with text only (stops tool chaining)
   */
  async continueChat(
    messages: ChatMessage[],
    functionResults: Array<{
      call_id: string;
      result: any;
      error?: string;
    }>,
    options?: { forceTextResponse?: boolean }
  ): Promise<{
    message?: string;
    functionCalls?: Array<{
      id: string;
      call_id: string;
      name: string;
      arguments: string;
    }>;
    finishReason: string;
  }> {
    const tools = getOpenAITools();

    // Convert messages to OpenAI format
    // CRITICAL: Assistant messages with function_call must be converted to tool_calls format
    const updatedMessages: any[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const msg: any = messages[i];
      
      // Check if this is an assistant message with function_call
      const hasFunctionCall = msg.function_call !== undefined && msg.function_call !== null;
      
      if (msg.role === 'assistant' && hasFunctionCall) {
        const functionCall = msg.function_call;
        
        if (!functionResults || functionResults.length === 0) {
          throw new Error('No function results provided for assistant message with function_call');
        }
        
        // Use the first function result's call_id
        const matchingResult = functionResults[0];
        const toolCallId = matchingResult.call_id;
        
        // Convert to tool_calls format (OpenAI expects this, not function_call)
        updatedMessages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: functionCall.name,
              arguments: functionCall.arguments
            }
          }]
        });
        
        // Add the corresponding tool message immediately after
        updatedMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(matchingResult.error ? { error: matchingResult.error } : matchingResult.result)
        });
      } else if (msg.role !== 'tool') {
        // For other messages (system, user, assistant without function_call), add as-is
        // Skip tool messages as we handle them above
        updatedMessages.push({
          role: msg.role,
          content: msg.content || (msg.role === 'assistant' ? null : undefined),
          name: msg.name
        });
      }
    }
    
    // Add any remaining function results that weren't matched
    const addedCallIds = new Set(
      updatedMessages
        .filter(m => m.role === 'tool')
        .map(m => m.tool_call_id)
    );
    
    for (const result of functionResults) {
      if (!addedCallIds.has(result.call_id)) {
        // Find the last assistant message with tool_calls
        const lastAssistantMsg = [...updatedMessages]
          .reverse()
          .find(m => m.role === 'assistant' && m.tool_calls);
        
        if (lastAssistantMsg && lastAssistantMsg.tool_calls) {
          const toolCallId = lastAssistantMsg.tool_calls[lastAssistantMsg.tool_calls.length - 1]?.id || result.call_id;
          updatedMessages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: JSON.stringify(result.error ? { error: result.error } : result.result)
          });
        }
      }
    }

    const forceText = options?.forceTextResponse === true;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: updatedMessages,
        tools: tools as any,
        tool_choice: forceText ? ('none' as const) : 'auto'
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      const message = choice.message;
      const finishReason = choice.finish_reason || 'stop';

      // When forceTextResponse was used, we requested tool_choice: 'none' so there are no tool_calls
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const functionCalls = message.tool_calls.map(toolCall => ({
          id: toolCall.id,
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments
        }));

        return {
          functionCalls,
          finishReason: 'tool_calls'
        };
      }

      // Final text response
      return {
        message: message.content || '',
        finishReason
      };
    } catch (error: any) {
      console.error('[OpenAIClient] Continue chat error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

