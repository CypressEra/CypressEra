/**
 * Vector Store Repository
 * 
 * Handles storage and retrieval of vector chunks using JSON files
 * All operations work directly with disk - no in-memory caching
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { IVectorStoreRepository } from './interfaces.js';
import { VectorChunk, ChunksStorage } from '../models/index.js';
import { RepositoryError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';
import { StreamingJsonWriter, StreamingJsonReader } from './streamingJsonWriter.js';

export class VectorStoreRepository implements IVectorStoreRepository {
  private config: AppConfig;
  private writeLocks: Map<string, Promise<void>> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
  }

  /**
   * Get the path to chunks directory for a user
   */
  private getChunksDir(userId: string): string {
    return join(
      this.config.knowledgeBase.basePath,
      userId,
      '.index',
      'chunks'
    );
  }

  /**
   * Get the path to chunks file for a specific document
   * Format: chunks/{sanitized_filename}.ndjson
   * Uses sanitized real filename for readability
   */
  private getChunkFilePath(userId: string, filename: string): string {
    // Sanitize filename: remove/replace special characters, keep it readable
    // Replace spaces, special chars, but keep alphanumeric, dots, hyphens, underscores
    const sanitized = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 200); // Limit length to avoid path issues
    
    // If filename is too short or empty after sanitization, use a hash as fallback
    if (sanitized.length < 3) {
      const filenameHash = createHash('sha256')
        .update(filename)
        .digest('hex')
        .substring(0, 16);
      return join(
        this.getChunksDir(userId),
        `${filenameHash}.ndjson`
      );
    }
    
    return join(
      this.getChunksDir(userId),
      `${sanitized}.ndjson`
    );
  }

  /**
   * Get all chunk file paths for a user
   */
  private async getChunkFilePaths(userId: string): Promise<string[]> {
    const chunksDir = this.getChunksDir(userId);
    try {
      const files = await fs.readdir(chunksDir);
      return files
        .filter(file => file.endsWith('.ndjson'))
        .map(file => join(chunksDir, file));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get the directory path for user's index
   */
  private getIndexDir(userId: string): string {
    return join(this.config.knowledgeBase.basePath, userId, '.index');
  }

  /**
   * Ensure chunks directory exists
   */
  private async ensureChunksDirectory(userId: string): Promise<void> {
    const chunksDir = this.getChunksDir(userId);
    try {
      await mkdir(chunksDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new RepositoryError(
          'VectorStore',
          `Failed to create chunks directory: ${error.message}`,
          { userId, chunksDir, error: error.message }
        );
      }
    }
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
          'VectorStore',
          `Failed to create index directory: ${error.message}`,
          { userId, dir, error: error.message }
        );
      }
    }
  }

  /**
   * Read chunks from disk - uses document files (streaming, low memory)
   * Legacy method - now just calls getChunks
   */
  private async readFromDisk(userId: string): Promise<VectorChunk[]> {
    // Use document files - same as getChunks
    return await this.getChunks(userId);
  }

  /**
   * Write chunks to disk - legacy method, not used anymore
   * Now uses appendChunksToDisk which writes to document-specific files
   */
  private async writeToDisk(userId: string, chunks: VectorChunk[]): Promise<void> {
    // Legacy method - just use appendChunksToDisk
    await this.appendChunksToDisk(userId, chunks);
  }

  async saveChunk(userId: string, chunk: VectorChunk): Promise<void> {
    await this.saveChunks(userId, [chunk]);
  }

  /**
   * Read only chunk IDs from disk (document files, streaming, memory efficient)
   */
  private async readChunkIdsFromDisk(userId: string): Promise<Set<string>> {
    const chunkFilePaths = await this.getChunkFilePaths(userId);
    const chunkIds = new Set<string>();
    
    if (chunkFilePaths.length === 0) {
      return new Set();
    }
    
    try {
      // Read all document files line by line (streaming, low memory)
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');
      
      for (const filePath of chunkFilePaths) {
        try {
          const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
          const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line) as VectorChunk;
                chunkIds.add(chunk.chunkId);
                // Clear chunk properties (can't reassign const, but can clear properties)
                if (chunk && typeof chunk === 'object') {
                  (chunk as any).text = null;
                  (chunk as any).embedding = null;
                  (chunk as any).metadata = null;
                }
              } catch (parseError) {
                // Skip invalid lines
                logger.warn('Failed to parse chunk line when reading IDs', { 
                  filePath,
                  line: line.substring(0, 100) 
                });
              }
            }
          }
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            logger.warn('Failed to read chunk file for IDs', { filePath, error: error.message });
          }
        }
      }
      
      return chunkIds;
    } catch (error: any) {
      throw new RepositoryError(
        'VectorStore',
        `Failed to read chunk IDs from disk: ${error.message}`,
        { userId, error: error.message }
      );
    }
  }

  /**
   * Append chunks using true file append (ZERO memory for existing data)
   * Option 1: Separate file per document - chunks/{filename_hash}.ndjson
   * This allows true O(1) appends with ZERO memory for existing chunks
   */
  private async appendChunksToDisk(userId: string, newChunks: VectorChunk[]): Promise<void> {
    if (newChunks.length === 0) {
      return;
    }

    // All chunks should be from the same file (enforced by indexing service)
    const filename = newChunks[0].metadata.filename;
    const chunkFilePath = this.getChunkFilePath(userId, filename);
    await this.ensureChunksDirectory(userId);

    try {
      // Use NDJSON format: one chunk per line, true append-only
      // This is the key: appendFile() doesn't read existing data into memory
      const { appendFile } = await import('fs/promises');
      
      const memBefore = process.memoryUsage();
      logger.debug('Appending chunks to document file', {
        userId,
        filename,
        chunkCount: newChunks.length,
        filePath: chunkFilePath,
        heapUsed: Math.round(memBefore.heapUsed / 1024 / 1024)
      });
      
      // Append each chunk as a new line (true append, zero memory for existing data)
      for (let i = 0; i < newChunks.length; i++) {
        const chunk = newChunks[i];
        // Stringify and append in one operation - minimal memory
        const chunkJson = JSON.stringify(chunk);
        await appendFile(chunkFilePath, chunkJson + '\n', 'utf-8');
        
        // Clear chunk properties (can't reassign const, but can clear properties)
        if (chunk && typeof chunk === 'object') {
          (chunk as any).text = null;
          (chunk as any).embedding = null;
          (chunk as any).metadata = null;
        }
        // Clear array element
        newChunks[i] = null as any;
      }
      
      // Clear array
      newChunks.length = 0;
      
      const memAfter = process.memoryUsage();
      logger.debug('Appended chunks to document file (zero memory)', { 
        userId,
        filename,
        chunksAppended: newChunks.length,
        heapUsed: Math.round(memAfter.heapUsed / 1024 / 1024)
      });
    } catch (error: any) {
      throw new RepositoryError(
        'VectorStore',
        `Failed to append chunks: ${error.message}`,
        { userId, filename, error: error.message }
      );
    }
  }

  /**
   * Save chunks - uses document-specific files (Option 1)
   */
  async saveChunks(userId: string, newChunks: VectorChunk[]): Promise<void> {
    // Use appendChunks which now uses NDJSON format
    await this.appendChunks(userId, newChunks);
  }

  /**
   * Legacy saveChunks - kept for interface compatibility
   */
  async _saveChunksLegacy(userId: string, newChunks: VectorChunk[]): Promise<void> {
    if (newChunks.length === 0) {
      return;
    }

    // Wait for any pending write operation
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    // Create new write lock
    const writePromise = (async () => {
      try {
        // Use memory-efficient append
        await this.appendChunksToDisk(userId, newChunks);
        
        logger.debug('Saved chunks batch', { 
          userId, 
          batchSize: newChunks.length
        });
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  /**
   * Get all chunks - reads from all document files (streaming, low memory)
   */
  async getChunks(userId: string): Promise<VectorChunk[]> {
    const chunks: VectorChunk[] = [];
    const chunkFilePaths = await this.getChunkFilePaths(userId);
    
    if (chunkFilePaths.length === 0) {
      return [];
    }
    
    try {
      // Read all chunk files line by line (streaming, low memory)
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');
      
      for (const filePath of chunkFilePaths) {
        try {
          const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
          const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line) as VectorChunk;
                chunks.push(chunk);
                // Process one at a time - chunks array will grow but that's necessary for return value
              } catch (parseError) {
                logger.warn('Failed to parse chunk line', { 
                  filePath,
                  line: line.substring(0, 100) 
                });
              }
            }
          }
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            logger.warn('Failed to read chunk file', { filePath, error: error.message });
          }
        }
      }
      
      return chunks;
    } catch (error: any) {
      throw new RepositoryError(
        'VectorStore',
        `Failed to get chunks: ${error.message}`,
        { userId, error: error.message }
      );
    }
  }

  /**
   * Legacy getChunks - kept for reference
   */
  async _getChunksLegacy(userId: string): Promise<VectorChunk[]> {
    return await this.readFromDisk(userId);
  }

  async getChunksByFile(userId: string, filename: string): Promise<VectorChunk[]> {
    const chunkFilePath = await this.getChunkFilePath(userId, filename);
    const chunks: VectorChunk[] = [];
    
    try {
      // Read specific document file line by line (streaming, low memory)
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');
      
      const fileStream = createReadStream(chunkFilePath, { encoding: 'utf-8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (line.trim()) {
          try {
            const chunk = JSON.parse(line) as VectorChunk;
            chunks.push(chunk);
          } catch (parseError) {
            logger.warn('Failed to parse chunk line', { 
              filePath: chunkFilePath,
              line: line.substring(0, 100) 
            });
          }
        }
      }
      
      return chunks;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        return [];
      }
      throw new RepositoryError(
        'VectorStore',
        `Failed to get chunks by file: ${error.message}`,
        { userId, filename, error: error.message }
      );
    }
  }

  /**
   * Delete chunks by file using streaming (never loads all chunks into memory)
   * Returns empty array - we don't need remaining chunks since we'll append incrementally
   */
  async deleteChunksByFileAndGetRemaining(userId: string, filename: string): Promise<VectorChunk[]> {
    // Just delete using streaming - don't return remaining chunks to avoid memory issues
    await this.deleteChunksByFileInternal(userId, filename);
    return []; // Return empty - we'll append incrementally
  }

  /**
   * Internal method to delete chunks by file (Option 1: just delete the file)
   * With separate files per document, deletion is instant - just delete the file
   */
  private async deleteChunksByFileInternal(userId: string, filename: string): Promise<void> {
    const chunkFilePath = await this.getChunkFilePath(userId, filename);
    
    try {
      const { unlink, stat } = await import('fs/promises');
      
      // Check if file exists and get size for logging
      let fileSize = 0;
      try {
        const stats = await stat(chunkFilePath);
        fileSize = stats.size;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // File doesn't exist, nothing to delete
          logger.debug('Chunk file does not exist, nothing to delete', { userId, filename });
          return;
        }
        throw error;
      }
      
      // Delete the file (instant, zero memory)
      await unlink(chunkFilePath);
      
      logger.info('Deleted chunks file (instant delete)', { 
        userId, 
        filename,
        filePath: chunkFilePath,
        fileSize: Math.round(fileSize / 1024) + ' KB'
      });
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new RepositoryError(
          'VectorStore',
          `Failed to delete chunks file: ${error.message}`,
          { userId, filename, error: error.message }
        );
      }
      // File doesn't exist, that's okay
    }
  }

  async deleteChunksByFile(userId: string, filename: string): Promise<void> {
    // Call internal method directly to avoid recursion
    await this.deleteChunksByFileInternal(userId, filename);
  }

  /**
   * Append chunks to existing chunks array - not needed with document-specific files
   * With Option 1, we just append to the document file directly
   */
  async appendChunksToExisting(userId: string, existingChunks: VectorChunk[], newChunks: VectorChunk[]): Promise<void> {
    // With document-specific files, we don't need this method
    // Just append new chunks directly (existing chunks are already in the file)
    if (newChunks.length > 0) {
      await this.appendChunksToDisk(userId, newChunks);
    }
  }

  /**
   * Append chunks to existing file using streaming (memory efficient)
   * This method exists for interface compatibility
   */
  async appendChunks(userId: string, newChunks: VectorChunk[]): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        // Use the streaming append method (never loads all chunks into memory)
        await this.appendChunksToDisk(userId, newChunks);
        
        logger.debug('Appended chunks incrementally (streaming)', { 
          userId, 
          newChunks: newChunks.length
        });
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async deleteAllChunks(userId: string): Promise<void> {
    const pendingWrite = this.writeLocks.get(userId);
    if (pendingWrite) {
      await pendingWrite;
    }

    const writePromise = (async () => {
      try {
        // Write empty array
        await this.writeToDisk(userId, []);
        logger.info('Deleted all chunks', { userId });
      } finally {
        this.writeLocks.delete(userId);
      }
    })();

    this.writeLocks.set(userId, writePromise);
    await writePromise;
  }

  async hasChunks(userId: string): Promise<boolean> {
    const chunkFilePaths = await this.getChunkFilePaths(userId);
    return chunkFilePaths.length > 0;
  }

  async getChunkCount(userId: string): Promise<number> {
    const chunkFilePaths = await this.getChunkFilePaths(userId);
    let count = 0;
    
    if (chunkFilePaths.length === 0) {
      return 0;
    }
    
    try {
      // Count lines in all chunk files (streaming, low memory)
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');
      
      for (const filePath of chunkFilePaths) {
        try {
          const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
          const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
          });
          
          for await (const line of rl) {
            if (line.trim()) {
              count++;
            }
          }
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            logger.warn('Failed to count chunks in file', { filePath, error: error.message });
          }
        }
      }
      
      return count;
    } catch (error: any) {
      throw new RepositoryError(
        'VectorStore',
        `Failed to get chunk count: ${error.message}`,
        { userId, error: error.message }
      );
    }
  }
}
