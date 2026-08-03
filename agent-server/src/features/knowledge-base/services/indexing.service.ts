import { IndexingServiceError } from '@core/utils/errors.js';
import { DocumentProcessorService } from './documentProcessor.service.js';
import { ChunkingService } from './chunking.service.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { IVectorStoreRepository } from '../repositories/interfaces.js';
import { IIndexMetadataRepository } from '../repositories/interfaces.js';
import { ProcessedDocument, ChunkingResult, VectorChunk } from '../models/index.js';
import { AppConfig } from '@core/config/index.js';
import { logger } from '@core/utils/logger.js';
import { createHash } from 'crypto';
import { join } from 'path';

export class IndexingService {
  constructor(
    private documentProcessor: DocumentProcessorService,
    private chunkingService: ChunkingService,
    private embeddingService: EmbeddingService,
    private vectorStoreRepo: IVectorStoreRepository,
    private indexMetadataRepo: IIndexMetadataRepository,
    private config: AppConfig
  ) {}

  /**
   * Index a document: process → chunk → embed → store
   */
  async indexDocument(userId: string, filePath: string, filename: string): Promise<void> {
    try {
      // filePath is relative (just filename) - construct absolute path only for file I/O
      const userPath = join(this.config.knowledgeBase.basePath, userId);
      const absoluteFilePath = join(userPath, filePath);
      
      // Step 1: Process document (extract text) - needs absolute path for readFile
      // Clear file buffer immediately after processing to help GC
      const processedDoc: ProcessedDocument = await this.documentProcessor.processDocument(
        absoluteFilePath,
        filename
      );
      
      // Step 2: Check if file needs re-indexing (hash comparison)
      const existingHash = await this.indexMetadataRepo.getFileHash(userId, filename);
      if (existingHash === processedDoc.fileHash) {
        logger.info('File already indexed with same hash, skipping', {
          userId,
          filename,
          hash: processedDoc.fileHash.substring(0, 8) + '...'
        });
        return;
      }

      // Step 3: Update file status to 'pending' (indexing in progress)
      await this.indexMetadataRepo.updateFileStatus(userId, filename, {
        status: 'pending',
        lastModified: new Date().toISOString(),
        chunkCount: 0
      });

      // Step 4: Delete existing chunks for this file (streaming - no memory accumulation)
      // We'll delete chunks and write remaining ones using streaming, then append new chunks incrementally
      await this.vectorStoreRepo.deleteChunksByFile(userId, filename);

      // Step 5 & 6: TRUE STREAMING - Process chunks one at a time directly from text
      // NEVER create an array of all chunks - this is the KEY to fixing memory issues
      const textToChunk = processedDoc.text;
      
      // Clear processedDoc text reference immediately
      (processedDoc as any).text = null;
      
      // Calculate chunking parameters (same as ChunkingService but inline)
      const charsPerToken = 4;
      const chunkSizeChars = this.config.knowledgeBase.chunkSize * charsPerToken;
      const overlapChars = this.config.knowledgeBase.chunkOverlap * charsPerToken;
      
      logger.info('Generating embeddings (true streaming - no chunk array)', {
        userId,
        filename,
        textLength: textToChunk.length,
        chunkSize: this.config.knowledgeBase.chunkSize,
        overlap: this.config.knowledgeBase.chunkOverlap
      });

      // Process chunks one at a time directly from text - NEVER store all chunks
      let startChar = 0;
      let chunkIndex = 0;
      let totalChunks = 0;
      const memStart = process.memoryUsage();
      const stepSize = chunkSizeChars - overlapChars; // How much to advance each iteration

      while (startChar < textToChunk.length) {
        const endChar = Math.min(startChar + chunkSizeChars, textToChunk.length);
        // Extract chunk text - this is the ONLY chunk in memory at this moment
        const chunkText = textToChunk.substring(startChar, endChar);
        
        // Safety check: if chunk is empty or too small, break
        if (chunkText.length === 0) {
          logger.warn('Empty chunk detected, stopping', { userId, filename, startChar, endChar });
          break;
        }
        
        // Log memory usage every 10 chunks
        if (chunkIndex % 10 === 0) {
          const memUsage = process.memoryUsage();
          logger.debug('Processing chunk (streaming)', {
            userId,
            filename,
            chunkIndex: chunkIndex + 1,
            startChar,
            endChar,
            chunkLength: chunkText.length,
            textLength: textToChunk.length,
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapDelta: Math.round((memUsage.heapUsed - memStart.heapUsed) / 1024 / 1024)
          });
        }

        // Generate embedding for this single chunk
        const embedding = await this.embeddingService.generateEmbedding(chunkText);
        
        // Estimate token count
        const tokenCount = Math.ceil(chunkText.length / charsPerToken);
        
        // Create vector chunk
        const vectorChunk: VectorChunk = {
          chunkId: this.generateChunkId(userId, filename, chunkIndex),
          text: chunkText, // Keep text for the chunk (needed for retrieval)
          embedding: embedding,
          metadata: {
            filename,
            chunkIndex: chunkIndex,
            fileHash: processedDoc.fileHash,
            startChar: startChar,
            endChar: endChar,
            tokenCount: tokenCount,
            createdAt: new Date().toISOString()
          }
        };
        
        // Write this single chunk immediately to disk (document-specific file - zero memory for existing)
        if (this.vectorStoreRepo.appendChunks) {
          await this.vectorStoreRepo.appendChunks(userId, [vectorChunk]);
        } else {
          // Fallback: use saveChunks (which also uses document files now)
          await this.vectorStoreRepo.saveChunks(userId, [vectorChunk]);
        }
        
        totalChunks++;
        
        // Clear references immediately to allow garbage collection
        if (vectorChunk && typeof vectorChunk === 'object') {
          (vectorChunk as any).text = null;
          (vectorChunk as any).embedding = null;
          (vectorChunk as any).metadata = null;
        }
        
        // Clear chunk text and embedding references
        // Note: Can't reassign const variables, but clearing properties helps GC
        // chunkText and embedding are primitives (string and array), so they'll be GC'd automatically
        
        // Move to next chunk with overlap - FIXED: ensure we always advance
        const nextStartChar = endChar - overlapChars;
        
        // Safety check: ensure we always advance forward
        if (nextStartChar <= startChar) {
          // If overlap is too large or we're not advancing, move forward by at least stepSize
          startChar = startChar + stepSize;
          logger.warn('Overlap too large, forcing forward progress', {
            userId,
            filename,
            oldStartChar: startChar - stepSize,
            newStartChar: startChar,
            endChar,
            stepSize
          });
        } else {
          startChar = nextStartChar;
        }
        
        // Final safety: if we've reached the end, break
        if (startChar >= textToChunk.length) {
          break;
        }
        
        chunkIndex++;
        
        // Force garbage collection every chunk (more aggressive)
        if (global.gc) {
          global.gc();
          // Wait longer for GC to complete
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Even without explicit GC, give event loop a chance
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // Clear text reference after processing all chunks
      // Note: Can't reassign const variables, but textToChunk will be GC'd after function returns
      
      // Final GC after all chunks processed
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      if (totalChunks === 0) {
        throw new IndexingServiceError(
          'No chunks generated from document',
          { userId, filename }
        );
      }
      
      // Log final memory usage
      const finalMem = process.memoryUsage();
      logger.info('Embeddings generation complete', {
        userId,
        filename,
        totalChunks,
        heapUsed: Math.round(finalMem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(finalMem.heapTotal / 1024 / 1024),
        rss: Math.round(finalMem.rss / 1024 / 1024)
      });

      // Step 9: Update file hash and status
      await this.indexMetadataRepo.updateFileHash(userId, filename, processedDoc.fileHash);
      await this.indexMetadataRepo.updateFileStatus(userId, filename, {
        status: 'indexed',
        chunkCount: totalChunks,
        lastModified: new Date().toISOString()
      });

      // Step 10: Update last indexed timestamp
      await this.indexMetadataRepo.updateLastIndexed(userId);

      logger.info('Document indexed successfully', {
        userId,
        filename,
        chunkCount: totalChunks,
        hash: processedDoc.fileHash.substring(0, 8) + '...'
      });
    } catch (error: any) {
      // Log the full error details for debugging
      logger.error('Document indexing failed with detailed error', error, {
        userId,
        filename,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.constructor.name,
        errorDetails: error.details || error.cause || 'No additional details'
      });

      // Update status to 'error' on failure
      try {
        await this.indexMetadataRepo.updateFileStatus(userId, filename, {
          status: 'error',
          lastModified: new Date().toISOString(),
          chunkCount: 0
        });
      } catch (updateError) {
        logger.error('Failed to update file status to error', updateError, { userId, filename });
      }

      if (error instanceof IndexingServiceError) {
        throw error;
      }

      throw new IndexingServiceError(
        `Failed to index document: ${error.message}`,
        { userId, filename, originalError: error.message, stack: error.stack }
      );
    }
  }

  /**
   * Generate a unique chunk ID
   */
  private generateChunkId(userId: string, filename: string, chunkIndex: number): string {
    const hash = createHash('sha256')
      .update(`${userId}:${filename}:${chunkIndex}`)
      .digest('hex');
    return `${hash.substring(0, 16)}-${chunkIndex}`;
  }

  /**
   * Delete a document and its associated chunks and metadata
   * Called when a knowledge base file is deleted
   */
  async deleteDocument(userId: string, filename: string): Promise<void> {
    try {
      logger.info('Deleting document and associated chunks', { userId, filename });

      // Step 1: Delete chunks (NDJSON file) - instant, zero memory
      // With separate file per document, this just deletes the single NDJSON file
      await this.vectorStoreRepo.deleteChunksByFile(userId, filename);

      // Step 2: Remove file from metadata (delete file entry from index.json)
      await this.indexMetadataRepo.removeFile(userId, filename);

      logger.info('Document deleted successfully', { userId, filename });
    } catch (error: any) {
      logger.error('Failed to delete document', error, { userId, filename });
      throw new IndexingServiceError(
        `Failed to delete document: ${error.message}`,
        { userId, filename, error: error.message }
      );
    }
  }
}
