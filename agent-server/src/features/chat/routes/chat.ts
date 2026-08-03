/**
 * Chat Routes
 * 
 * Route definitions for chat endpoints - delegates to controller
 */

import { Router } from 'express';
import { ChatController } from '../controllers/index.js';

export function createChatRoutes(chatController: ChatController): Router {
  const router = Router();

  /**
   * POST /api/v1/chat/stream
   * Send a chat message to the AI (streaming)
   */
  router.post('/api/v1/chat/stream', (req, res) => {
    chatController.chatStream(req, res);
  });

  /**
   * POST /api/v1/chat
   * Send a chat message to the AI (non-streaming, for backward compatibility)
   */
  router.post('/api/v1/chat', (req, res) => {
    chatController.chat(req, res);
  });

  /**
   * POST /api/v1/chat/continue/stream
   * Continue chat after function execution (streaming)
   */
  router.post('/api/v1/chat/continue/stream', (req, res) => {
    chatController.continueChatStream(req, res);
  });

  /**
   * POST /api/v1/chat/continue
   * Continue chat after function execution (non-streaming, for backward compatibility)
   */
  router.post('/api/v1/chat/continue', (req, res) => {
    chatController.continueChat(req, res);
  });

  return router;
}

