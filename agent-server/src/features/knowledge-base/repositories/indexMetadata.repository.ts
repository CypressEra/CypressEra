/**
 * Index Metadata Repository
 * 
 * Handles storage and retrieval of index metadata
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { IIndexMetadataRepository } from './interfaces.js';
import { IndexMetadata, FileIndexingStatus } from '../models/index.js';
import { RepositoryError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';

export class IndexMetadataRepository implements IIndexMetadataRepository {
  private config: AppConfig;
  private inMemoryCache: Map<string, IndexMetadata> = new Map();
  private writeLocks: Map<string, Promise<void>> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Get the path to index.json for a user
   */
  private getIndexPath(userId: string): string {
    return join(
      this.config.knowledgeBase.basePath,
      userId,
      '.index',
      'index.json'
    );
  }

  /**
   * Get the directory path for user's index
   */
  private getIndexDir(userId: string): string {
    return join(this.config.knowledgeBase.basePath, userId, '.index');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(userId: string): Promise<void> {
    const dir = this.getIndexDir(userId);
    try {
      await mkdir(dir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new RepositoryError(
          'IndexMetadata',
          `Failed to create index directory: ${error.message}`,
          { userId, dir, error: error.message }
        );
      }
    }
  }

  /**
   * Load metadata from disk into memory
   */
  private async loadFromDisk(userId: string): Promise<void> {
    const indexPath = this.getIndexPath(userId);
    
    try {
      const data = await fs.readFile(indexPath, 'utf-8');
      const metadata: IndexMetadata = JSON.parse(data);
      this.inMemoryCache.set(userId, metadata);
      logger.debug('Loaded index metadata from disk', { userId });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, initialize default
        const defaultMetadata: IndexMetadata = {
          version: '1.0',
          userId,
          lastIndexed: new Date().toISOString(),
          fileHashes: {},
          indexingStatus: {}
        };
        this.inMemoryCache.set(userId, defaultMetadata);
        logger.debug('No existing index metadata, initialized default', { userId });
      } else {
        throw new RepositoryError(
          'IndexMetadata',
          `Failed to load index metadata from disk: ${error.message}`,
          { userId, error: error.message }
        );
      }
    }
  }

  /**
   * Save metadata to disk
   */
  private async saveToDisk(userId: string): Promise<void> {
    const indexPath = this.getIndexPath(userId);
    const metadata = this.inMemoryCache.get(userId);
    
    if (!metadata) {
      throw new RepositoryError(
        'IndexMetadata',
        'No metadata in memory for user',
        { userId }
      );
    }

    await this.ensureDirectory(userId);

    try {
      // Write to temporary file first, then rename (atomic operation)
      const tempPath = `${indexPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');
      await fs.rename(tempPath, indexPath);
      
      logger.debug('Saved index metadata to disk', { userId });
    } catch (error: any) {
      throw new RepositoryError(
        'IndexMetadata',
        `Failed to save index metadata to disk: ${error.message}`,
        { userId, error: error.message }
      );
    }
  }

  /**
   * Get or create in-memory cache for user
   */
  private async ensureCache(userId: string): Promise<IndexMetadata> {
    if (!this.inMemoryCache.has(userId)) {
      await this.loadFromDisk(userId);
    }
    return this.inMemoryCache.get(userId)!;
  }

  async getMetadata(userId: string): Promise<IndexMetadata | null> {
    try {
      return await this.ensureCache(userId);
    } catch (error) {
      logger.error('Failed to get metadata', error, { userId });
      return null;
    }
  }

  async saveMetadata(userId: string, metadata: IndexMetadata): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        this.inMemoryCache.set(userId, metadata);
        await this.saveToDisk(userId);
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async updateFileHash(userId: string, filename: string, hash: string): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        const metadata = await this.ensureCache(userId);
        metadata.fileHashes[filename] = hash;
        await this.saveToDisk(userId);
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async getFileHash(userId: string, filename: string): Promise<string | null> {
    const metadata = await this.ensureCache(userId);
    return metadata.fileHashes[filename] || null;
  }

  async updateFileStatus(
    userId: string,
    filename: string,
    status: FileIndexingStatus
  ): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        const metadata = await this.ensureCache(userId);
        metadata.indexingStatus[filename] = status;
        await this.saveToDisk(userId);
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async getFileStatus(userId: string, filename: string): Promise<FileIndexingStatus | null> {
    const metadata = await this.ensureCache(userId);
    return metadata.indexingStatus[filename] || null;
  }

  async needsReindexing(userId: string, filename: string, currentHash: string): Promise<boolean> {
    const storedHash = await this.getFileHash(userId, filename);
    return storedHash === null || storedHash !== currentHash;
  }

  async updateLastIndexed(userId: string): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        const metadata = await this.ensureCache(userId);
        metadata.lastIndexed = new Date().toISOString();
        await this.saveToDisk(userId);
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async removeFile(userId: string, filename: string): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        const metadata = await this.ensureCache(userId);
        
        // Remove file from indexing status
        if (metadata.indexingStatus[filename]) {
          delete metadata.indexingStatus[filename];
        }
        
        // Remove file hash
        if (metadata.fileHashes[filename]) {
          delete metadata.fileHashes[filename];
        }
        
        await this.saveToDisk(userId);
        
        logger.info('Removed file from metadata', { userId, filename });
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }
}

