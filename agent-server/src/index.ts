import { MCPServer } from './server.js';
import { createApp } from './app.js';
import { logger } from '@core/utils/logger.js';

const container = createApp();
const server = new MCPServer(container);

server.start().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  try {
    await server.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason as Error, { promise });
  process.exit(1);
});
