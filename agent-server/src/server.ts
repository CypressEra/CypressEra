import express, { Express } from 'express';
import cors from 'cors';
import { createChatRoutes, createKnowledgeBaseRoutes } from '@features/chat/routes/index.js';
import { requestLogger, errorHandler, authMiddleware } from '@core/middleware/index.js';
import type { ServiceContainer } from '@core/di/container.js';
import { ChatController, KnowledgeBaseController } from '@features/chat/controllers/index.js';
import { FileWatcherService, IndexingService } from '@features/knowledge-base/services/index.js';
import { logger } from '@core/utils/logger.js';

export class MCPServer {
  private app: Express;
  private container: ServiceContainer;

  constructor(container: ServiceContainer) {
    this.container = container;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    const config = this.container.getConfig();
    if (config.logging.enableRequestLogging) {
      this.app.use(requestLogger);
    }
  }

  private async setupRoutes() {
    const config = this.container.getConfig();

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'agent-server', version: '1.0.0', environment: config.appEnv });
    });

    this.app.use('/api/v1', authMiddleware);

    const chatController = this.container.get<ChatController>('chatController');
    this.app.use(createChatRoutes(chatController));

    const indexingService = this.container.get<IndexingService>('indexingService');
    const fileWatcherService = this.container.get<FileWatcherService>('fileWatcherService');
    const kbController = new KnowledgeBaseController(indexingService, fileWatcherService);
    this.app.use(createKnowledgeBaseRoutes(kbController));

    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    await this.setupRoutes();
    await this.container.initializeAll();

    const config = this.container.getConfig();
    this.app.listen(config.port, () => {
      logger.info('Server started', { port: config.port, environment: config.appEnv });
      console.log(`[MCP Server] 🚀 Server running on port ${config.port}`);
      console.log(`[MCP Server] 📡 API available at http://localhost:${config.port}/api/v1`);
      console.log(`[MCP Server] 🌍 Environment: ${config.appEnv}`);
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down server...');
    await this.container.shutdownAll();
    logger.info('Server shutdown complete');
  }

  getApp(): Express {
    return this.app;
  }
}
