/**
 * Retrieval Service
 * 
 * Handles query embedding generation, vector similarity search, and context formatting
 */

import { EmbeddingService } from './embedding.service.js';
import { IVectorStoreRepository } from '../repositories/index.js';
import { RetrievalResult, VectorChunk } from '../models/index.js';
import { RetrievalServiceError } from '@core/utils/errors.js';
import { cosineSimilarity } from '@core/utils/math.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';

/** Cache entry for retrieval results (short TTL to speed up repeated/similar queries). */
const RETRIEVAL_CACHE_TTL_MS = 30_000; // 30 seconds

export class RetrievalService {
  private embeddingService: EmbeddingService;
  private vectorStoreRepo: IVectorStoreRepository;
  private config: AppConfig;
  private cache = new Map<string, { result: RetrievalResult; expiry: number }>();

  constructor(
    embeddingService: EmbeddingService,
    vectorStoreRepo: IVectorStoreRepository,
    config: AppConfig
  ) {
    this.embeddingService = embeddingService;
    this.vectorStoreRepo = vectorStoreRepo;
    this.config = config;
  }

  /**
   * Retrieve relevant chunks for a query
   */
  async retrieve(userId: string, query: string): Promise<RetrievalResult> {
    try {
      // Short-lived cache: same user + same normalized query within TTL returns immediately
      const cacheKey = `${userId}:${query.trim().toLowerCase().slice(0, 500)}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiry) {
        logger.debug('Retrieval cache hit', { userId, queryLength: query.length });
        return cached.result;
      }

      // Check if user has any chunks
      const hasChunks = await this.vectorStoreRepo.hasChunks(userId);
      if (!hasChunks) {
        logger.debug('No chunks found for user', { userId });
        const empty: RetrievalResult = { chunks: [], scores: [], queryEmbedding: [] };
        this.cache.set(cacheKey, { result: empty, expiry: Date.now() + RETRIEVAL_CACHE_TTL_MS });
        return empty;
      }

      // Run embedding (network) and getChunks (disk I/O) in parallel to reduce latency
      const topK = this.config.knowledgeBase.topK;
      const [queryEmbedding, allChunks] = await Promise.all([
        this.embeddingService.generateEmbedding(query),
        this.vectorStoreRepo.getChunks(userId)
      ]);

      if (allChunks.length === 0) {
        const empty: RetrievalResult = { chunks: [], scores: [], queryEmbedding };
        this.cache.set(cacheKey, { result: empty, expiry: Date.now() + RETRIEVAL_CACHE_TTL_MS });
        return empty;
      }

      logger.debug('Calculating similarity scores', {
        userId,
        chunkCount: allChunks.length
      });

      const scoredChunks = allChunks.map(chunk => ({
        chunk,
        similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
      }));

      // Sort by similarity (highest first) and get top K
      scoredChunks.sort((a, b) => b.similarity - a.similarity);
      const topChunks = scoredChunks.slice(0, topK);

      logger.info('Retrieved chunks', {
        userId,
        queryLength: query.length,
        totalChunks: allChunks.length,
        topK: topChunks.length,
        topSimilarity: topChunks[0]?.similarity?.toFixed(4) ?? 0
      });

      const result: RetrievalResult = {
        chunks: topChunks.map(item => item.chunk),
        scores: topChunks.map(item => item.similarity),
        queryEmbedding
      };
      this.cache.set(cacheKey, { result, expiry: Date.now() + RETRIEVAL_CACHE_TTL_MS });
      return result;
    } catch (error: any) {
      if (error instanceof RetrievalServiceError) {
        throw error;
      }

      throw new RetrievalServiceError(
        `Failed to retrieve chunks: ${error.message}`,
        { userId, error: error.message }
      );
    }
  }

  /**
   * Format retrieved chunks as context text for LLM
   */
  formatContext(retrievalResult: RetrievalResult): string {
    if (retrievalResult.chunks.length === 0) {
      return '';
    }

    logger.debug('Formatting knowledge base context', {
      chunkCount: retrievalResult.chunks.length,
      chunks: retrievalResult.chunks.map((chunk, index) => ({
        rank: index + 1,
        filename: chunk.metadata.filename,
        chunkIndex: chunk.metadata.chunkIndex,
        similarity: retrievalResult.scores[index]?.toFixed(4),
        textLength: chunk.text.length
      }))
    });

    const contextParts = retrievalResult.chunks.map((chunk, index) => {
      const score = retrievalResult.scores[index];
      const metadata = chunk.metadata;
      
      return `[Document: ${metadata.filename}, Section ${metadata.chunkIndex + 1}]\n${chunk.text}`;
    });

    const formattedContext = contextParts.join('\n\n---\n\n');
    
    logger.debug('Knowledge base context formatted', {
      totalLength: formattedContext.length,
      chunkCount: retrievalResult.chunks.length
    });

    return formattedContext;
  }
}

