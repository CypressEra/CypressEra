/**
 * Vector-related Type Definitions
 * 
 * Additional types for vector operations
 */

/**
 * Vector similarity search result
 */
export interface SimilarityResult {
  chunk: any; // VectorChunk
  similarity: number;
  rank: number;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * Batch embedding response
 */
export interface BatchEmbeddingResponse {
  embeddings: number[][];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}
