/**
 * Repository Interfaces
 * 
 * Defines contracts for data access layer
 */

import { VectorChunk, IndexMetadata, FileIndexingStatus } from '../models/index.js';

/**
 * Vector store repository interface
 */
export interface IVectorStoreRepository {
  /**
   * Save a chunk to the vector store
   */
  saveChunk(userId: string, chunk: VectorChunk): Promise<void>;

  /**
   * Save multiple chunks in batch
   */
  saveChunks(userId: string, chunks: VectorChunk[]): Promise<void>;

  /**
   * Get all chunks for a user
   */
  getChunks(userId: string): Promise<VectorChunk[]>;

  /**
   * Get chunks by filename
   */
  getChunksByFile(userId: string, filename: string): Promise<VectorChunk[]>;

  /**
   * Delete chunks by filename
   */
  deleteChunksByFile(userId: string, filename: string): Promise<void>;

  /**
   * Delete chunks by filename and return remaining chunks (optimized for batch operations)
   */
  deleteChunksByFileAndGetRemaining?(userId: string, filename: string): Promise<VectorChunk[]>;

  /**
   * Append chunks to existing chunks array without reading from disk
   */
  appendChunksToExisting?(userId: string, existingChunks: VectorChunk[], newChunks: VectorChunk[]): Promise<void>;

  /**
   * Append chunks to existing file (reads from disk, appends, writes back)
   * More memory efficient for incremental writes
   */
  appendChunks?(userId: string, newChunks: VectorChunk[]): Promise<void>;

  /**
   * Delete all chunks for a user
   */
  deleteAllChunks(userId: string): Promise<void>;

  /**
   * Check if user has any chunks
   */
  hasChunks(userId: string): Promise<boolean>;

  /**
   * Get chunk count for a user
   */
  getChunkCount(userId: string): Promise<number>;
}

/**
 * Index metadata repository interface
 */
export interface IIndexMetadataRepository {
  /**
   * Get index metadata for a user
   */
  getMetadata(userId: string): Promise<IndexMetadata | null>;

  /**
   * Save or update index metadata
   */
  saveMetadata(userId: string, metadata: IndexMetadata): Promise<void>;

  /**
   * Update file hash
   */
  updateFileHash(userId: string, filename: string, hash: string): Promise<void>;

  /**
   * Get file hash
   */
  getFileHash(userId: string, filename: string): Promise<string | null>;

  /**
   * Update file indexing status
   */
  updateFileStatus(
    userId: string,
    filename: string,
    status: FileIndexingStatus
  ): Promise<void>;

  /**
   * Get file indexing status
   */
  getFileStatus(userId: string, filename: string): Promise<FileIndexingStatus | null>;

  /**
   * Check if file needs re-indexing (hash changed)
   */
  needsReindexing(userId: string, filename: string, currentHash: string): Promise<boolean>;

  /**
   * Update last indexed timestamp
   */
  updateLastIndexed(userId: string): Promise<void>;

  /**
   * Remove a file from metadata (when file is deleted)
   */
  removeFile(userId: string, filename: string): Promise<void>;
}
