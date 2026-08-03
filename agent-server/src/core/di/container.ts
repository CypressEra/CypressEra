/**
 * Dependency Injection Container
 * 
 * Manages service registration and dependency resolution
 */

import { AppConfig, getConfig } from '../config/index.js';
import { createLogger, getLogger } from '../utils/logger.js';
import type { PluginModule } from './plugin.js';

// MCP Services
import { OpenAIClient } from '../../mcp/openaiClient.js';

// Knowledge Base Services
import { EmbeddingService } from '@features/knowledge-base/services/embedding.service.js';
import { DocumentProcessorService } from '@features/knowledge-base/services/documentProcessor.service.js';
import { ChunkingService } from '@features/knowledge-base/services/chunking.service.js';
import { IndexingService } from '@features/knowledge-base/services/indexing.service.js';
import { RetrievalService } from '@features/knowledge-base/services/retrieval.service.js';
import { FileWatcherService } from '@features/knowledge-base/services/fileWatcher.service.js';

// Knowledge Base Repositories
import { VectorStoreRepository } from '@features/knowledge-base/repositories/vectorStore.repository.js';
import { IndexMetadataRepository } from '@features/knowledge-base/repositories/indexMetadata.repository.js';


export class ServiceContainer {
  private config: AppConfig;
  private services: Map<string, any> = new Map();
  private plugins: PluginModule[] = [];

  constructor(config?: AppConfig) {
    this.config = config || getConfig();
    
    // Initialize logger first
    createLogger(this.config);
    
    // Register all services
    this.registerServices();
  }

  /**
   * Register all services with their dependencies
   */
  private registerServices(): void {
    // Repositories (no dependencies)
    const vectorStoreRepo = new VectorStoreRepository(this.config);
    const indexMetadataRepo = new IndexMetadataRepository(this.config);
    
    this.services.set('vectorStoreRepository', vectorStoreRepo);
    this.services.set('indexMetadataRepository', indexMetadataRepo);

    // Embedding Service (depends on config)
    const embeddingService = new EmbeddingService(this.config);
    this.services.set('embeddingService', embeddingService);

    // Document Processor Service (no dependencies)
    const documentProcessor = new DocumentProcessorService();
    this.services.set('documentProcessor', documentProcessor);

    // Chunking Service (depends on config)
    const chunkingService = new ChunkingService(this.config);
    this.services.set('chunkingService', chunkingService);

    // Indexing Service (depends on multiple services)
    const indexingService = new IndexingService(
      documentProcessor,
      chunkingService,
      embeddingService,
      vectorStoreRepo,
      indexMetadataRepo,
      this.config
    );
    this.services.set('indexingService', indexingService);

    // File Watcher Service (depends on indexing service and index metadata repo)
    const fileWatcherService = new FileWatcherService(this.config, indexingService, indexMetadataRepo);
    this.services.set('fileWatcherService', fileWatcherService);

    // Retrieval Service (depends on embedding service and vector store)
    const retrievalService = new RetrievalService(
      embeddingService,
      vectorStoreRepo,
      this.config
    );
    this.services.set('retrievalService', retrievalService);

    // OpenAI Client (for chat, not KB)
    const openaiClient = new OpenAIClient(
      this.config.openaiApiKey,
      this.config.openaiModel,
      this.config.openaiBaseUrl
    );
    this.services.set('openaiClient', openaiClient);

  }

  /**
   * Register a named service directly (used by plugins)
   */
  register(key: string, instance: unknown): void {
    this.services.set(key, instance);
  }

  /**
   * Register a plugin, calling its register() immediately
   */
  registerPlugin(plugin: PluginModule): void {
    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }
    plugin.register(this);
    this.plugins.push(plugin);
  }

  getPlugins(): PluginModule[] {
    return [...this.plugins];
  }

  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.initialize) await plugin.initialize();
    }
  }

  async shutdownAll(): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      if (plugin.shutdown) await plugin.shutdown();
    }
  }

  /**
   * Get a service by name
   */
  get<T>(serviceName: string): T {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service '${serviceName}' not found in container`);
    }
    return service as T;
  }

  /**
   * Get configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get logger
   */
  getLogger() {
    return getLogger();
  }
}

// Singleton instance
let containerInstance: ServiceContainer | null = null;

/**
 * Get or create the service container instance
 */
export function getContainer(config?: AppConfig): ServiceContainer {
  if (!containerInstance) {
    containerInstance = new ServiceContainer(config);
  }
  return containerInstance;
}

/**
 * Reset container (mainly for testing)
 */
export function resetContainer(): void {
  containerInstance = null;
}

