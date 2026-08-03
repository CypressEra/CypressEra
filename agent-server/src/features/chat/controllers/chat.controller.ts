/**
 * Chat Controller
 * 
 * Handles chat-related HTTP requests
 * 
 * ARCHITECTURE: Tools are executed directly via API-Server (not through frontend SDK)
 * This enables headless mode and reduces latency.
 */

import { Request, Response } from 'express';
import { ChatRequest, ChatResponse, FunctionResultRequest } from '@core/types/index.js';
import { OpenAIClient } from '../../../mcp/openaiClient.js';
import { RetrievalService } from '@features/knowledge-base/services/retrieval.service.js';
import { buildSystemPrompt, type SystemPromptContext } from '../prompts/index.js';
import { ValidationError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';
import { normalizedCallKey, DUPLICATE_CALL_MESSAGE } from '@core/utils/duplicateCalls.js';
import { executeToolCalls, type ToolExecutionContext } from '@core/utils/toolExecutor.js';
import type { Brain } from '@modules/brain/types.js';

// Maximum tool execution rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 10;

/** Get the last assistant message that has a function_call (same tool call we just executed). */
function getLastAssistantToolCall(messages: { role?: string; function_call?: { name: string; arguments: string } }[]): { name: string; arguments: string } | null {
  const last = [...messages].reverse().find(m => m.role === 'assistant' && m.function_call);
  return last?.function_call ?? null;
}

export class ChatController {
  private openaiClient: OpenAIClient;
  private retrievalService: RetrievalService;
  private config: AppConfig;
  private brain: Brain | null = null;

  constructor(
    openaiClient: OpenAIClient,
    retrievalService: RetrievalService,
    config: AppConfig,
    brain?: Brain
  ) {
    this.openaiClient = openaiClient;
    this.retrievalService = retrievalService;
    this.config = config;
    this.brain = brain ?? null;
  }

  /**
   * Handle chat request (streaming)
   * 
   * ARCHITECTURE: Tools are executed directly via API-Server, not returned to frontend.
   * Flushes headers and sends a "start" event immediately so the client gets a fast connection;
   * then runs KB retrieval (with timeout) and streams from OpenAI.
   */
  async chatStream(req: Request, res: Response): Promise<void> {
    try {
      const request: ChatRequest = req.body;

      // Validate request
      if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
        throw new ValidationError('messages array is required and must not be empty');
      }

      // Set SSE headers and send first byte immediately so client sees connection quickly
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // nginx: disable buffering
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      // Extract user's JWT token from Authorization header
      const authHeader = req.headers.authorization;
      const userToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
      
      if (!userToken) {
        logger.warn('No user token provided in Authorization header');
      }

      const userId = request.context?.userId;
      const sessionId = request.context?.currentSession;

      // Knowledge base retrieval with timeout so we don't block the stream for long
      const useKnowledgeBase = request.context?.useKnowledgeBase === true;
      let knowledgeBaseContext = '';

      if (useKnowledgeBase && userId) {
        try {
          const lastUserMessage = [...request.messages]
            .reverse()
            .find(msg => msg.role === 'user');

          if (lastUserMessage?.content) {
            logger.info('Retrieving knowledge base context', {
              userId,
              query: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : '')
            });
            const retrievalResult = await this.retrievalService.retrieve(
              userId,
              lastUserMessage.content
            );

            if (retrievalResult.chunks.length > 0) {
              knowledgeBaseContext = this.retrievalService.formatContext(retrievalResult);
              logger.info('Knowledge base context added to system prompt', {
                userId,
                chunkCount: retrievalResult.chunks.length,
                contextLength: knowledgeBaseContext.length,
                chunks: retrievalResult.chunks.map((chunk, index) => ({
                  rank: index + 1,
                  filename: chunk.metadata.filename,
                  chunkIndex: chunk.metadata.chunkIndex,
                  similarity: retrievalResult.scores[index]?.toFixed(4)
                }))
              });
            } else {
              logger.info('No relevant chunks found in knowledge base', { userId });
            }
          }
        } catch (error: any) {
          logger.error('Failed to retrieve knowledge base context', error, { userId });
        }
      }

      // Brain dispatch: when brain is enabled, route ALL requests through BrainEngine
      if (this.brain) {
        logger.info('[ChatController] Routing to BrainEngine');
        await this.brain.run({
          messages: request.messages,
          context: { sessionId, userId, availableFiles: request.context?.availableFiles, userToken, knowledgeBaseContext },
          res,
        });
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }

      // Build system message with context
      const systemPromptContext: SystemPromptContext = {
        currentSession: sessionId,
        userId: userId,
        availableFiles: request.context?.availableFiles,
        knowledgeBaseContext
      };

      const systemMessage = {
        role: 'system' as const,
        content: buildSystemPrompt(systemPromptContext)
      };

      let messages = [systemMessage, ...request.messages];

      // Tool execution context
      let toolContext: ToolExecutionContext = {
        sessionId,
        userId,
        userToken, // Pass user's JWT token for API-Server authentication
      };

      // Execute tools in a loop until we get a text response
      let toolRounds = 0;
      const executedTools: Array<{ name: string; args: unknown; result: unknown }> = [];

      // Stream the response
      while (toolRounds < MAX_TOOL_ROUNDS) {
        let hasFunctionCalls = false;
        let functionCalls: Array<{ id: string; call_id: string; name: string; arguments: string }> = [];
        let accumulatedContent = '';

        for await (const event of this.openaiClient.chatStreamLegacy(messages)) {
          if (event.type === 'function_call') {
            hasFunctionCalls = true;
            // Accumulate function call data
            const existing = functionCalls.find(fc => fc.call_id === event.call_id);
            if (existing) {
              if (event.name) existing.name = event.name;
              if (event.arguments) existing.arguments = event.arguments;
            } else if (event.call_id) {
              functionCalls.push({
                id: event.call_id,
                call_id: event.call_id,
                name: event.name || '',
                arguments: event.arguments || '',
              });
            }
          } else if (event.type === 'complete') {
            // Check if we have function calls
            if (event.functionCalls && event.functionCalls.length > 0) {
              hasFunctionCalls = true;
              functionCalls = event.functionCalls;
            } else {
              // Text response - send complete event with message, then done
              res.write(`data: ${JSON.stringify({ 
                type: 'complete',
                message: event.message || '',
              })}\n\n`);
              // Send done with debug info
              res.write(`data: ${JSON.stringify({ 
                type: 'done',
                _debug: process.env.NODE_ENV !== 'production' ? {
                  toolRounds,
                  executedTools: executedTools.map(t => ({ name: t.name, success: !(t.result as any)?.error })),
                } : undefined,
              })}\n\n`);
              res.end();
              return;
            }
          } else if (event.type === 'chunk' && !hasFunctionCalls) {
            // Stream text content
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          } else if (event.type === 'error') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
            res.end();
            return;
          }
        }

        // If no function calls, we're done (send complete then done)
        if (!hasFunctionCalls || functionCalls.length === 0) {
          res.write(`data: ${JSON.stringify({ type: 'complete', message: '' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
          return;
        }

        // Execute tools directly
        toolRounds++;
        logger.info('[ChatController] Streaming: Executing tools directly', {
          round: toolRounds,
          tools: functionCalls.map(fc => fc.name),
        });

        // Send tool execution event to frontend
        res.write(`data: ${JSON.stringify({ 
          type: 'tool_execution', 
          tools: functionCalls.map(fc => ({ name: fc.name, call_id: fc.call_id })),
          round: toolRounds,
        })}\n\n`);

        // Execute tools directly via API-Server
        const { results: toolResults, sessionId: newSessionId } = await executeToolCalls(functionCalls, toolContext);

        // Update session ID if changed
        if (newSessionId && newSessionId !== toolContext.sessionId) {
          toolContext = { ...toolContext, sessionId: newSessionId };
          logger.info('[ChatController] Session ID updated in context', { sessionId: newSessionId });
        }

        // Log executed tools
        functionCalls.forEach((call, idx) => {
          let args: unknown;
          try {
            args = JSON.parse(call.arguments);
          } catch {
            args = call.arguments;
          }
          executedTools.push({
            name: call.name,
            args,
            result: toolResults[idx]?.result,
          });
        });

        // Send tool results event to frontend with tool names and result data
        // Include result data so frontend can extract session_id and other info
        res.write(`data: ${JSON.stringify({
          type: 'tool_results',
          results: toolResults.map((tr, idx) => ({
            call_id: tr.call_id,
            name: functionCalls[idx]?.name || 'unknown',
            success: !tr.error,
            error: tr.error,
            result: tr.result, // Include full result data (contains session_id for session creation)
          })),
        })}\n\n`);

        // Build assistant message with tool calls
        const assistantMessage: any = {
          role: 'assistant',
          content: null,
          tool_calls: functionCalls.map(fc => ({
            id: fc.call_id,
            type: 'function',
            function: {
              name: fc.name,
              arguments: fc.arguments,
            },
          })),
        };

        // Build tool result messages
        const toolMessages = toolResults.map(tr => ({
          role: 'tool' as const,
          tool_call_id: tr.call_id,
          content: JSON.stringify(tr.result),
        }));

        // Update messages with assistant + tool results
        messages = [...messages, assistantMessage, ...toolMessages];
      }

      // Max rounds reached - force text response
      logger.warn('[ChatController] Streaming: Max tool rounds reached, forcing text response');
      
      let finalMessage = '';
      for await (const event of this.openaiClient.chatStreamLegacy(messages)) {
        if (event.type === 'chunk') {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          if (event.content) finalMessage += event.content;
        } else if (event.type === 'complete') {
          if (event.message) {
            finalMessage = event.message;
          }
        } else if (event.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
        }
      }

      // Send complete event with final message, then done
      res.write(`data: ${JSON.stringify({ type: 'complete', message: finalMessage })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error: any) {
      logger.error('Chat stream request failed', error, {
        path: req.path,
        method: req.method
      });

      // Send error event
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Failed to process chat request' })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle chat request (non-streaming)
   * 
   * ARCHITECTURE: Tools are executed directly via API-Server, not returned to frontend.
   * This enables headless mode and reduces latency.
   */
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const request: ChatRequest = req.body;

      // Validate request
      if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
        throw new ValidationError('messages array is required and must not be empty');
      }

      // Extract user's JWT token from Authorization header
      const authHeader = req.headers.authorization;
      const userToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

      // Check if knowledge base should be used
      const useKnowledgeBase = request.context?.useKnowledgeBase === true;
      const userId = request.context?.userId;
      const sessionId = request.context?.currentSession;

      let knowledgeBaseContext = '';

      if (useKnowledgeBase && userId) {
        try {
          // Get the last user message for retrieval
          const lastUserMessage = [...request.messages]
            .reverse()
            .find(msg => msg.role === 'user');

          if (lastUserMessage?.content) {
            logger.info('Retrieving knowledge base context', { 
              userId, 
              query: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : '')
            });
            const retrievalResult = await this.retrievalService.retrieve(
              userId,
              lastUserMessage.content
            );

            if (retrievalResult.chunks.length > 0) {
              knowledgeBaseContext = this.retrievalService.formatContext(retrievalResult);
              logger.info('Knowledge base context added to system prompt', {
                userId,
                chunkCount: retrievalResult.chunks.length,
                contextLength: knowledgeBaseContext.length,
                chunks: retrievalResult.chunks.map((chunk, index) => ({
                  rank: index + 1,
                  filename: chunk.metadata.filename,
                  chunkIndex: chunk.metadata.chunkIndex,
                  similarity: retrievalResult.scores[index]?.toFixed(4)
                }))
              });
            } else {
              logger.info('No relevant chunks found in knowledge base', { userId });
            }
          }
        } catch (error: any) {
          // Log error but don't fail the request - fall back to normal chat
          logger.error('Failed to retrieve knowledge base context', error, { userId });
        }
      }

      // Build system message with context
      const systemPromptContext: SystemPromptContext = {
        currentSession: sessionId,
        userId: userId,
        availableFiles: request.context?.availableFiles,
        knowledgeBaseContext
      };

      const systemMessage = {
        role: 'system' as const,
        content: buildSystemPrompt(systemPromptContext)
      };

      let messages = [systemMessage, ...request.messages];

      // Tool execution context
      let toolContext: ToolExecutionContext = {
        sessionId,
        userId,
        userToken, // Pass user's JWT token for API-Server authentication
      };

      // Execute tools in a loop until we get a text response
      let response = await this.openaiClient.chat(messages);
      let toolRounds = 0;
      const executedTools: Array<{ name: string; args: unknown; result: unknown }> = [];

      while (response.functionCalls && response.functionCalls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
        toolRounds++;
        logger.info('[ChatController] Executing tools directly', {
          round: toolRounds,
          tools: response.functionCalls.map(fc => fc.name),
        });

        // Execute tools directly via API-Server
        const { results: toolResults, sessionId: newSessionId } = await executeToolCalls(response.functionCalls, toolContext);

        // Update session ID if changed
        if (newSessionId && newSessionId !== toolContext.sessionId) {
          toolContext = { ...toolContext, sessionId: newSessionId };
          logger.info('[ChatController] Session ID updated in context', { sessionId: newSessionId });
        }

        // Log executed tools
        response.functionCalls.forEach((call, idx) => {
          let args: unknown;
          try {
            args = JSON.parse(call.arguments);
          } catch {
            args = call.arguments;
          }
          executedTools.push({
            name: call.name,
            args,
            result: toolResults[idx]?.result,
          });
        });

        // Build assistant message with tool calls
        const assistantMessage: any = {
          role: 'assistant',
          content: null,
          tool_calls: response.functionCalls.map(fc => ({
            id: fc.call_id,
            type: 'function',
            function: {
              name: fc.name,
              arguments: fc.arguments,
            },
          })),
        };

        // Build tool result messages
        const toolMessages = toolResults.map(tr => ({
          role: 'tool' as const,
          tool_call_id: tr.call_id,
          content: JSON.stringify(tr.result),
        }));

        // Update messages with assistant + tool results
        messages = [...messages, assistantMessage, ...toolMessages];

        // Get next response from OpenAI
        response = await this.openaiClient.chat(messages);
      }

      if (toolRounds >= MAX_TOOL_ROUNDS) {
        logger.warn('[ChatController] Max tool rounds reached, forcing text response');
        response = await this.openaiClient.chat(messages);
      }

      // Prepare response - no functionCalls returned, tools are executed directly
      const chatResponse: ChatResponse = {
        success: true,
        message: response.message,
        // Tools are executed directly, no need to return functionCalls to frontend
        functionCalls: undefined,
        requiresFunctionExecution: false,
        // Include executed tools for debugging/transparency
        _debug: process.env.NODE_ENV !== 'production' ? {
          toolRounds,
          executedTools: executedTools.map(t => ({ name: t.name, success: !(t.result as any)?.error })),
        } : undefined,
      };

      res.json(chatResponse);
    } catch (error: any) {
      logger.error('Chat request failed', error, {
        path: req.path,
        method: req.method
      });

      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to process chat request'
        });
      }
    }
  }

  /**
   * Handle continue chat request (after function execution) - streaming
   */
  async continueChatStream(req: Request, res: Response): Promise<void> {
    try {
      const request: FunctionResultRequest = req.body;

      // Validate request
      if (!request.messages || !Array.isArray(request.messages)) {
        throw new ValidationError('messages array is required');
      }

      if (!request.functionResults || !Array.isArray(request.functionResults)) {
        throw new ValidationError('functionResults array is required');
      }

      // Set SSE headers and send first byte immediately
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      // Duplicate detection logic (same as non-streaming)
      const lastCall = getLastAssistantToolCall(request.messages);
      const lastCallKey = lastCall ? normalizedCallKey(lastCall.name, lastCall.arguments) : null;

      const isDuplicate = (name: string, args: string) =>
        lastCallKey != null && normalizedCallKey(name, args) === lastCallKey;

      // Knowledge base retrieval with timeout
      const useKnowledgeBase = request.context?.useKnowledgeBase === true;
      const userId = request.context?.userId;
      let knowledgeBaseContext = '';

      if (useKnowledgeBase && userId) {
        try {
          const lastUserMessage = [...request.messages]
            .reverse()
            .find(msg => msg.role === 'user');

          if (lastUserMessage?.content) {
            logger.info('Retrieving knowledge base context for continue chat', {
              userId,
              query: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : '')
            });
            const retrievalResult = await this.retrievalService.retrieve(
              userId,
              lastUserMessage.content
            );

            if (retrievalResult.chunks.length > 0) {
              knowledgeBaseContext = this.retrievalService.formatContext(retrievalResult);
              logger.info('Knowledge base context added to continue chat', {
                userId,
                chunkCount: retrievalResult.chunks.length,
                contextLength: knowledgeBaseContext.length
              });
            }
          }
        } catch (error: any) {
          logger.error('Failed to retrieve knowledge base context', error, { userId });
        }
      }

      // Build system message with context
      const systemPromptContext: SystemPromptContext = {
        currentSession: request.context?.currentSession,
        userId: request.context?.userId,
        availableFiles: request.context?.availableFiles,
        knowledgeBaseContext
      };

      const systemMessage = {
        role: 'system' as const,
        content: buildSystemPrompt(systemPromptContext)
      };

      // Handle message trimming logic
      const assistantWithCall = request.messages.filter(
        (m: any) => m.role === 'assistant' && m.function_call
      );
      const numResults = request.functionResults.length;
      let messagesToUse = request.messages;
      let resultsToUse = request.functionResults;
      if (assistantWithCall.length > numResults && numResults > 0) {
        const lastIdx = request.messages.lastIndexOf(assistantWithCall[assistantWithCall.length - 1]);
        messagesToUse = request.messages.slice(0, lastIdx + 1);
        resultsToUse = request.functionResults.slice(-numResults);
      }

      const messages = [systemMessage, ...messagesToUse];
      const forceTextResponse = request.context?.forceTextResponse === true;

      // Stream response
      for await (const event of this.openaiClient.continueChatStream(messages, resultsToUse, { forceTextResponse })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Send final done message
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error: any) {
      logger.error('Continue chat stream request failed', error, {
        path: req.path,
        method: req.method
      });

      // Send error event
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Failed to continue chat' })}\n\n`);
      res.end();
    }
  }

  /**
   * Handle continue chat request (after function execution) - non-streaming
   */
  async continueChat(req: Request, res: Response): Promise<void> {
    try {
      const request: FunctionResultRequest = req.body;

      // Validate request
      if (!request.messages || !Array.isArray(request.messages)) {
        throw new ValidationError('messages array is required');
      }

      if (!request.functionResults || !Array.isArray(request.functionResults)) {
        throw new ValidationError('functionResults array is required');
      }

      // Duplicate = model returned the same tool call as the last assistant message (compare by normalized key)
      const lastCall = getLastAssistantToolCall(request.messages);
      const lastCallKey = lastCall ? normalizedCallKey(lastCall.name, lastCall.arguments) : null;

      const isDuplicate = (name: string, args: string) =>
        lastCallKey != null && normalizedCallKey(name, args) === lastCallKey;

      // Check if knowledge base should be used
      const useKnowledgeBase = request.context?.useKnowledgeBase === true;
      const userId = request.context?.userId;

      let knowledgeBaseContext = '';

      if (useKnowledgeBase && userId) {
        try {
          // Get the last user message for retrieval
          const lastUserMessage = [...request.messages]
            .reverse()
            .find(msg => msg.role === 'user');

          if (lastUserMessage?.content) {
            logger.info('Retrieving knowledge base context for continue chat', { 
              userId,
              query: lastUserMessage.content.substring(0, 100) + (lastUserMessage.content.length > 100 ? '...' : '')
            });
            const retrievalResult = await this.retrievalService.retrieve(
              userId,
              lastUserMessage.content
            );

            if (retrievalResult.chunks.length > 0) {
              knowledgeBaseContext = this.retrievalService.formatContext(retrievalResult);
              logger.info('Knowledge base context added to continue chat', {
                userId,
                chunkCount: retrievalResult.chunks.length,
                contextLength: knowledgeBaseContext.length,
                chunks: retrievalResult.chunks.map((chunk, index) => ({
                  rank: index + 1,
                  filename: chunk.metadata.filename,
                  chunkIndex: chunk.metadata.chunkIndex,
                  similarity: retrievalResult.scores[index]?.toFixed(4)
                }))
              });
            } else {
              logger.info('No relevant chunks found in knowledge base for continue', { userId });
            }
          }
        } catch (error: any) {
          logger.error('Failed to retrieve knowledge base context', error, { userId });
        }
      }

      // Build system message with context
      const systemPromptContext: SystemPromptContext = {
        currentSession: request.context?.currentSession,
        userId: request.context?.userId,
        availableFiles: request.context?.availableFiles,
        knowledgeBaseContext
      };

      const systemMessage = {
        role: 'system' as const,
        content: buildSystemPrompt(systemPromptContext)
      };

      // If more assistant tool-call messages than results (e.g. client sent 5 assistant + 1 result), trim to last assistant + last result(s) so OpenAI sees one turn
      const assistantWithCall = request.messages.filter(
        (m: any) => m.role === 'assistant' && m.function_call
      );
      const numResults = request.functionResults.length;
      let messagesToUse = request.messages;
      let resultsToUse = request.functionResults;
      if (assistantWithCall.length > numResults && numResults > 0) {
        const lastIdx = request.messages.lastIndexOf(assistantWithCall[assistantWithCall.length - 1]);
        messagesToUse = request.messages.slice(0, lastIdx + 1);
        resultsToUse = request.functionResults.slice(-numResults);
      }

      const messages = [systemMessage, ...messagesToUse];

      // Continue chat with function results; force text when client requests it to stop tool chaining
      const forceTextResponse = request.context?.forceTextResponse === true;
      let response = await this.openaiClient.continueChat(messages, resultsToUse, { forceTextResponse });

      // If the model returned the same tool call as the last message (duplicate), inject "already called" and force text.
      const maxDuplicateRounds = 3;
      for (let round = 0; round < maxDuplicateRounds && response.functionCalls && response.functionCalls.length > 0; round++) {
        const duplicates = response.functionCalls.filter(fc =>
          isDuplicate(fc.name, fc.arguments ?? '')
        );
        if (duplicates.length === 0) break;
        const first = duplicates[0];
        logger.info('Duplicate tool call detected (same as last message), injecting "do not repeat" result', {
          name: first.name,
          round: round + 1
        });
        const newRequestMessages = [
          ...request.messages,
          {
            role: 'assistant' as const,
            content: undefined as string | undefined,
            function_call: { name: first.name, arguments: first.arguments }
          }
        ];
        const newMessages = [systemMessage, ...newRequestMessages];
        const syntheticResults = [
          {
            call_id: first.call_id,
            result: {
              status: 'success' as const,
              message: DUPLICATE_CALL_MESSAGE,
              next_action: 'reply' as const
            }
          }
        ];
        response = await this.openaiClient.continueChat(newMessages, syntheticResults, {
          forceTextResponse: true
        });
        request.messages = newRequestMessages;
      }

      // Never return the same tool call as the last message (duplicate)
      const allowedCalls = (response.functionCalls ?? []).flatMap(fc =>
        fc != null && !isDuplicate(fc.name, fc.arguments ?? '')
          ? [fc]
          : []
      );
      const hasNewCalls = allowedCalls.length > 0;

      // Prepare response (forceTextApplied makes it explicit that this turn was text-only)
      const chatResponse: ChatResponse = {
        success: true,
        message: response.message,
        functionCalls: hasNewCalls ? allowedCalls.map(fc => ({
          id: fc.id,
          call_id: fc.call_id,
          name: fc.name,
          arguments: fc.arguments
        })) : undefined,
        requiresFunctionExecution: hasNewCalls,
        forceTextApplied: forceTextResponse
      };

      res.json(chatResponse);
    } catch (error: any) {
      logger.error('Continue chat request failed', error, {
        path: req.path,
        method: req.method
      });

      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to continue chat'
        });
      }
    }
  }
}

