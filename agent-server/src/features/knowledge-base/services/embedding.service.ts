/**
 * Embedding Service
 * 
 * Handles OpenAI embedding generation with batch processing and retry logic
 */

import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { EmbeddingServiceError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';
import { BatchEmbeddingRequest, BatchEmbeddingResponse } from '../models/index.js';

export class EmbeddingService {
  private client: OpenAI;
  private model: string;
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(config: AppConfig) {
    // Only use proxy if explicitly set in environment variables
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 
                     process.env.https_proxy || process.env.http_proxy;
    
    // Use separate embedding API key if provided, otherwise fall back to main OpenAI API key
    const apiKey = config.knowledgeBase.embeddingApiKey || config.openaiApiKey;
    const clientOptions: any = { apiKey };
    
    // Log embedding configuration (mask API key for security)
    logger.info('Initializing EmbeddingService', {
      model: config.knowledgeBase.embeddingModel,
      hasEmbeddingApiKey: !!config.knowledgeBase.embeddingApiKey,
      hasOpenaiApiKey: !!config.openaiApiKey,
      usingKey: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'none',
      embeddingBaseUrl: config.knowledgeBase.embeddingBaseUrl || 'default (OpenAI)'
    });
    
    // Set base URL for embeddings (always required - set in config with OpenAI default)
    // This ensures we don't accidentally use OPENAI_BASE_URL from environment (which is for chat model)
    clientOptions.baseURL = config.knowledgeBase.embeddingBaseUrl;
    logger.info('Using embedding base URL', { 
      baseUrl: config.knowledgeBase.embeddingBaseUrl,
      model: config.knowledgeBase.embeddingModel
    });
    
    // Configure proxy if available
    if (proxyUrl) {
      try {
        clientOptions.httpAgent = new HttpsProxyAgent(proxyUrl);
        logger.info('Using proxy for embeddings', { proxyUrl: proxyUrl.replace(/:[^:@]*@/, ':****@') });
      } catch (error) {
        logger.warn('Failed to configure proxy for embeddings', { error });
      }
    } else {
      logger.info('No proxy configured for embeddings, using direct connection');
    }
    
    this.client = new OpenAI(clientOptions);
    this.model = config.knowledgeBase.embeddingModel;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.generateEmbeddings([text]);
    const embedding = result.embeddings[0];
    
    // Clear result object properties (can be large with metadata)
    // Note: Can't reassign const, but we can clear properties to help GC
    if (result && typeof result === 'object') {
      (result as any).embeddings = null;
      (result as any).usage = null;
    }
    
    return embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        model: this.model
      };
    }

    // OpenAI allows up to 2048 inputs per request, but we'll batch in smaller chunks
    // Reduced batch size to avoid memory issues with large documents
    const batchSize = 5; // Very small batch size for memory efficiency
    const batches: string[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.debug('Generating embeddings batch', {
        batchIndex: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length
      });

      const batchResult = await this.generateEmbeddingsWithRetry(batch);
      allEmbeddings.push(...batchResult.embeddings);
      
      if (batchResult.usage) {
        totalTokens += batchResult.usage.totalTokens;
      }
      
      // Clear batch result properties (can't reassign const)
      if (batchResult && typeof batchResult === 'object') {
        (batchResult as any).embeddings = null;
        (batchResult as any).usage = null;
      }
    }

    return {
      embeddings: allEmbeddings,
      model: this.model,
      usage: totalTokens > 0 ? {
        promptTokens: totalTokens,
        totalTokens
      } : undefined
    };
  }

  /**
   * Generate embeddings with retry logic
   */
  private async generateEmbeddingsWithRetry(
    texts: string[],
    attempt: number = 1
  ): Promise<BatchEmbeddingResponse> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts
      });

      // Extract data before clearing
      const embeddings = response.data.map(item => item.embedding);
      const usage = response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined;
      
      // Clear response object properties immediately (can be large)
      // Note: Can't reassign const, but we can clear properties to help GC
      if (response && typeof response === 'object') {
        (response as any).data = null;
        (response as any).usage = null;
      }
      
      logger.debug('Generated embeddings', {
        count: embeddings.length,
        dimensions: embeddings[0]?.length || 0
      });

      return {
        embeddings,
        model: this.model,
        usage
      };
    } catch (error: any) {
      const isRateLimit = error.status === 429;
      const isRetryable = error.status >= 500 || isRateLimit;

      // Log detailed error information
      logger.error('Embedding API call failed', error, {
        attempt,
        maxRetries: this.maxRetries,
        isRateLimit,
        isRetryable,
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: error.code,
        errorType: error.type,
        errorHeaders: error.headers ? JSON.stringify(error.headers) : 'none',
        model: this.model,
        textsCount: texts.length,
        firstTextLength: texts[0]?.length || 0
      });

      if (isRetryable && attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn('Embedding API error, retrying', {
          attempt,
          maxRetries: this.maxRetries,
          delay,
          error: error.message,
          status: error.status
        });

        await this.sleep(delay);
        return this.generateEmbeddingsWithRetry(texts, attempt + 1);
      }

      throw new EmbeddingServiceError(
        `Failed to generate embeddings: ${error.message}`,
        {
          attempt,
          textsCount: texts.length,
          error: error.message,
          status: error.status,
          code: error.code,
          type: error.type
        }
      );
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

