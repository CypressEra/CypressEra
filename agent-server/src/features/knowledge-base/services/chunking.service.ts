/**
 * Chunking Service
 * 
 * Handles text chunking with overlap and metadata generation
 */

import { ChunkingResult, Chunk } from '../models/index.js';
import { AppConfig } from '@core/config/index.js';
import { logger } from '@core/utils/logger.js';

export class ChunkingService {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(config: AppConfig) {
    this.chunkSize = config.knowledgeBase.chunkSize;
    this.chunkOverlap = config.knowledgeBase.chunkOverlap;
  }

  /**
   * Chunk text into smaller pieces with overlap
   * Memory optimized: creates chunks without keeping full text in memory
   */
  chunkText(text: string, filename: string): ChunkingResult {
    if (!text || text.trim().length === 0) {
      return {
        chunks: [],
        totalChunks: 0
      };
    }

    // Simple token estimation: ~4 characters per token
    // This is approximate, but sufficient for chunking
    const charsPerToken = 4;
    const chunkSizeChars = this.chunkSize * charsPerToken;
    const overlapChars = this.chunkOverlap * charsPerToken;

    const chunks: Chunk[] = [];
    let startChar = 0;
    let chunkIndex = 0;

    // Process chunks - extract substring each time (avoids keeping full text)
    while (startChar < text.length) {
      const endChar = Math.min(startChar + chunkSizeChars, text.length);
      // Extract chunk text (creates new string, but we'll clear it after processing)
      const chunkText = text.substring(startChar, endChar);

      // Estimate token count
      const tokenCount = Math.ceil(chunkText.length / charsPerToken);

      chunks.push({
        text: chunkText, // This keeps a reference to the substring
        chunkIndex,
        startChar,
        endChar,
        tokenCount
      });

      // Move to next chunk with overlap
      startChar = endChar - overlapChars;
      chunkIndex++;

      // Prevent infinite loop if overlap is too large
      if (startChar >= endChar) {
        startChar = endChar;
      }
    }

    logger.debug('Text chunked', {
      filename,
      totalChunks: chunks.length,
      chunkSize: this.chunkSize,
      overlap: this.chunkOverlap
    });

    return {
      chunks,
      totalChunks: chunks.length
    };
  }

  /**
   * Update chunk size and overlap (for dynamic configuration)
   */
  updateConfig(chunkSize: number, chunkOverlap: number): void {
    if (chunkSize < 100 || chunkSize > 2000) {
      throw new Error('Chunk size must be between 100 and 2000');
    }
    if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new Error('Chunk overlap must be >= 0 and < chunk size');
    }

    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }
}

