/**
 * Knowledge Base Controller
 * 
 * Handles knowledge base management endpoints
 */

import { Request, Response } from 'express';
import { IndexingService } from '@features/knowledge-base/services/indexing.service.js';
import { FileWatcherService } from '@features/knowledge-base/services/fileWatcher.service.js';
import { IIndexMetadataRepository } from '@features/knowledge-base/repositories/index.js';
import { ValidationError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';
import { getContainer } from '@core/di/index.js';

export class KnowledgeBaseController {
  private indexingService: IndexingService;
  private fileWatcherService: FileWatcherService;

  constructor(indexingService: IndexingService, fileWatcherService: FileWatcherService) {
    this.indexingService = indexingService;
    this.fileWatcherService = fileWatcherService;
  }

  /**
   * Index all files for a user
   * POST /api/v1/knowledge-base/index
   */
  async indexAllFiles(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.body;

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required and must be a string');
      }

      logger.info('Manual indexing requested', { userId });

      // File watcher handles indexing automatically
      // This endpoint is kept for backward compatibility but doesn't perform indexing
      res.json({
        success: true,
        message: 'File watcher handles indexing automatically. Files are indexed when added or modified.',
        stats: null
      });
    } catch (error: any) {
      logger.error('Index all files failed', error, {
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
          error: error.message || 'Failed to index files'
        });
      }
    }
  }

  /**
   * Register a user and ensure their directory is being watched
   * POST /api/v1/knowledge-base/register-user
   * Called when frontend loads to ensure file watcher is active for the user
   */
  async registerUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.body;

      if (!userId || typeof userId !== 'string') {
        throw new ValidationError('userId is required and must be a string');
      }

      logger.info('User registration requested', { userId });

      // Ensure the user's directory is being watched
      await this.fileWatcherService.watchUserDirectory(userId);

      res.json({
        success: true,
        message: 'User registered and file watcher activated',
        userId
      });
    } catch (error: any) {
      logger.error('User registration failed', error, {
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
          error: error.message || 'Failed to register user'
        });
      }
    }
  }

  /**
   * Get indexing status for a user
   * GET /api/v1/knowledge-base/status/:userId
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        throw new ValidationError('userId is required');
      }

      // Get status from metadata repository
      const container = getContainer();
      const indexMetadataRepo = container.get<IIndexMetadataRepository>('indexMetadataRepository');
      const metadata = await indexMetadataRepo.getMetadata(userId);

      res.json({
        success: true,
        metadata: metadata || null
      });
    } catch (error: any) {
      logger.error('Get status failed', error, {
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
          error: error.message || 'Failed to get status'
        });
      }
    }
  }
}

