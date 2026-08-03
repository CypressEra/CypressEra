import type { PluginModule } from '@core/di/plugin.js';
import type { ServiceContainer } from '@core/di/container.js';
import { FileWatcherService } from './services/fileWatcher.service.js';
import { logger } from '@core/utils/logger.js';

export class KnowledgeBasePlugin implements PluginModule {
  readonly name = 'knowledge-base';
  private fileWatcherService: FileWatcherService | null = null;
  private enableFileWatcher = false;

  register(container: ServiceContainer): void {
    this.fileWatcherService = container.get<FileWatcherService>('fileWatcherService');
    this.enableFileWatcher = container.getConfig().knowledgeBase.enableFileWatcher;
  }

  async initialize(): Promise<void> {
    if (this.fileWatcherService && this.enableFileWatcher) {
      try {
        await this.fileWatcherService.initialize();
        logger.info('[KnowledgeBasePlugin] File watchers initialized');
      } catch (error: any) {
        logger.error('[KnowledgeBasePlugin] Failed to initialize file watchers', error);
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.fileWatcherService) {
      await this.fileWatcherService.stopAll();
    }
  }
}
