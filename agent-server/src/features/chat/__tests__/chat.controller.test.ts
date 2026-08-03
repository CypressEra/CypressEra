/**
 * Integration Tests for Chat Controller Routing
 * Task 6.5: Integration tests for chat controller routing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { OpenAIClient } from '../../mcp/openaiClient.js';
import { RetrievalService } from '../../knowledgeBase/services/retrieval.service.js';
import { AppConfig } from '../../common/config/index.js';

// Mock dependencies
vi.mock('../../mcp/openaiClient.js');
vi.mock('../../knowledgeBase/services/retrieval.service.js');
vi.mock('../../common/config/index.js');

describe('ChatController Routing', () => {
  let controller: ChatController;
  let mockOpenAIClient: any;
  let mockRetrievalService: any;
  let mockConfig: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    mockOpenAIClient = {
      chat: vi.fn(),
      chatStream: vi.fn(),
      continueChat: vi.fn(),
      continueChatStream: vi.fn()
    };

    mockRetrievalService = {
      retrieve: vi.fn().mockResolvedValue({ chunks: [], scores: [] }),
      formatContext: vi.fn().mockReturnValue('')
    };

    mockConfig = {
      supervisor: {
        enabled: true,
        complexityThreshold: 20,
        maxRetryAttempts: 3,
        planningTimeout: 10000
      }
    };

    controller = new ChatController(mockOpenAIClient, mockRetrievalService, mockConfig);

    // Setup request/response mocks
    mockRequest = {
      body: {},
      path: '/chat',
      method: 'POST'
    };

    mockResponse = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      write: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      flushHeaders: vi.fn().mockReturnThis(),
      headersSent: false
    };
  });

  describe('POST /chat (non-streaming)', () => {
    it('should route simple request to single-agent mode', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      mockOpenAIClient.chat.mockResolvedValue({
        message: { role: 'assistant', content: 'Hi there!' },
        functionCalls: []
      });

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAIClient.chat).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.any(Object)
        })
      );
    });

    it('should route complex request through supervisor-executor flow', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Read the configuration file and update the database with the new settings' }
        ]
      };

      mockOpenAIClient.chat.mockResolvedValue({
        message: { role: 'assistant', content: 'Task completed' },
        functionCalls: []
      });

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAIClient.chat).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    it('should validate request body', async () => {
      mockRequest.body = {};

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('required')
        })
      );
    });

    it('should handle empty messages array', async () => {
      mockRequest.body = {
        messages: []
      };

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should integrate knowledge base when enabled', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'What is the project structure?' }
        ],
        context: {
          useKnowledgeBase: true,
          userId: 'user-123'
        }
      };

      mockRetrievalService.retrieve.mockResolvedValue({
        chunks: [
          { content: 'Project has src and test folders', metadata: { filename: 'README.md' } }
        ],
        scores: [0.9]
      });

      mockOpenAIClient.chat.mockResolvedValue({
        message: { role: 'assistant', content: 'The project has src and test folders' },
        functionCalls: []
      });

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockRetrievalService.retrieve).toHaveBeenCalledWith('user-123', 'What is the project structure?');
      expect(mockOpenAIClient.chat).toHaveBeenCalled();
    });

    it('should handle knowledge base retrieval errors gracefully', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test message' }
        ],
        context: {
          useKnowledgeBase: true,
          userId: 'user-123'
        }
      };

      mockRetrievalService.retrieve.mockRejectedValue(new Error('KB error'));
      mockOpenAIClient.chat.mockResolvedValue({
        message: { role: 'assistant', content: 'Response' },
        functionCalls: []
      });

      await controller.chat(mockRequest as Request, mockResponse as Response);

      // Should still complete successfully despite KB error
      expect(mockOpenAIClient.chat).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });
  });

  describe('POST /chat/stream (streaming)', () => {
    it('should stream response for simple request', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const mockStream = (async function* () {
        yield { type: 'content', delta: 'Hi' };
        yield { type: 'content', delta: ' there' };
      })();

      mockOpenAIClient.chatStream.mockReturnValue(mockStream);

      await controller.chatStream(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockResponse.write).toHaveBeenCalled();
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should send start event immediately', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      const mockStream = (async function* () {
        yield { type: 'content', delta: 'Response' };
      })();

      mockOpenAIClient.chatStream.mockReturnValue(mockStream);

      await controller.chatStream(mockRequest as Request, mockResponse as Response);

      // First write should be start event
      const firstCall = mockResponse.write.mock.calls[0];
      expect(firstCall[0]).toContain('start');
    });

    it('should send done event at the end', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      const mockStream = (async function* () {
        yield { type: 'content', delta: 'Response' };
      })();

      mockOpenAIClient.chatStream.mockReturnValue(mockStream);

      await controller.chatStream(mockRequest as Request, mockResponse as Response);

      // Last write should be done event
      const calls = mockResponse.write.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toContain('done');
    });

    it('should handle streaming errors', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      const mockStream = (async function* () {
        yield { type: 'content', delta: 'Partial' };
        throw new Error('Stream error');
      })();

      mockOpenAIClient.chatStream.mockReturnValue(mockStream);

      await controller.chatStream(mockRequest as Request, mockResponse as Response);

      // Should send error event
      const calls = mockResponse.write.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toContain('error');
    });
  });

  describe('POST /chat/continue (non-streaming)', () => {
    it('should continue chat with function results', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Read file' },
          { role: 'assistant', content: '', function_call: { name: 'read_file', arguments: '{}' } }
        ],
        functionResults: [
          { call_id: 'call-1', result: { status: 'success', data: 'file content' } }
        ]
      };

      mockOpenAIClient.continueChat.mockResolvedValue({
        message: { role: 'assistant', content: 'The file contains...' },
        functionCalls: []
      });

      await controller.continueChat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAIClient.continueChat).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true
        })
      );
    });

    it('should validate function results', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ],
        functionResults: null
      };

      await controller.continueChat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should handle duplicate tool calls', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Read file' },
          { role: 'assistant', content: '', function_call: { name: 'read_file', arguments: '{"path": "test.txt"}' } }
        ],
        functionResults: [
          { call_id: 'call-1', result: { status: 'success', data: 'content' } }
        ]
      };

      // Mock duplicate call response
      mockOpenAIClient.continueChat
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: '', function_call: { name: 'read_file', arguments: '{"path": "test.txt"}' } },
          functionCalls: [{ name: 'read_file', arguments: '{"path": "test.txt"}', id: 'call-2' }]
        })
        .mockResolvedValueOnce({
          message: { role: 'assistant', content: 'Done' },
          functionCalls: []
        });

      await controller.continueChat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAIClient.continueChat).toHaveBeenCalled();
    });
  });

  describe('POST /chat/continue/stream (streaming)', () => {
    it('should stream continue chat response', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Read file' },
          { role: 'assistant', content: '', function_call: { name: 'read_file', arguments: '{}' } }
        ],
        functionResults: [
          { call_id: 'call-1', result: { status: 'success', data: 'content' } }
        ]
      };

      const mockStream = (async function* () {
        yield { type: 'content', delta: 'Based on the file...' };
      })();

      mockOpenAIClient.continueChatStream.mockReturnValue(mockStream);

      await controller.continueChatStream(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockResponse.write).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      const apiError = new Error('API rate limit');
      (apiError as any).statusCode = 429;
      mockOpenAIClient.chat.mockRejectedValue(apiError);

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'API rate limit'
        })
      );
    });

    it('should handle unexpected errors', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Test' }
        ]
      };

      mockOpenAIClient.chat.mockRejectedValue(new Error('Unexpected error'));

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Context Preservation', () => {
    it('should preserve session context across requests', async () => {
      mockRequest.body = {
        messages: [
          { role: 'user', content: 'Continue from previous' }
        ],
        context: {
          currentSession: 'session-123',
          userId: 'user-456',
          availableFiles: ['file1.ts', 'file2.ts']
        }
      };

      mockOpenAIClient.chat.mockResolvedValue({
        message: { role: 'assistant', content: 'Continuing...' },
        functionCalls: []
      });

      await controller.chat(mockRequest as Request, mockResponse as Response);

      expect(mockOpenAIClient.chat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system'
          })
        ])
      );
    });
  });
});
