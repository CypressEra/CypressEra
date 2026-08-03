/**
 * Knowledge Base Routes
 * 
 * Route definitions for knowledge base endpoints
 */

import { Router } from 'express';
import { KnowledgeBaseController } from '../controllers/knowledgeBase.controller.js';

export function createKnowledgeBaseRoutes(kbController: KnowledgeBaseController): Router {
  const router = Router();

  /**
   * POST /api/v1/knowledge-base/register-user
   * Register a user and ensure their directory is being watched
   * Should be called when frontend loads to activate file watching
   */
  router.post('/api/v1/knowledge-base/register-user', (req, res) => {
    kbController.registerUser(req, res);
  });

  /**
   * POST /api/v1/knowledge-base/index
   * Manually trigger indexing for a user
   */
  router.post('/api/v1/knowledge-base/index', (req, res) => {
    kbController.indexAllFiles(req, res);
  });

  /**
   * GET /api/v1/knowledge-base/status/:userId
   * Get indexing status for a user
   */
  router.get('/api/v1/knowledge-base/status/:userId', (req, res) => {
    kbController.getStatus(req, res);
  });

  return router;
}

