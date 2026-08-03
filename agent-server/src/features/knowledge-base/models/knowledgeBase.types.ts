/**
 * Knowledge Base Data Models
 * 
 * Type definitions for knowledge base structures
 */

/**
 * Vector chunk with embedding and metadata
 */
export interface VectorChunk {
  chunkId: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  filename: string;
  chunkIndex: number;
  fileHash: string;
  startChar?: number;
  endChar?: number;
  tokenCount?: number;
  createdAt: string;
}

/**
 * Index metadata structure
 */
export interface IndexMetadata {
  version: string;
  userId: string;
  lastIndexed: string;
  fileHashes: Record<string, string>;
  indexingStatus: Record<string, FileIndexingStatus>;
}

/**
 * File indexing status
 */
export interface FileIndexingStatus {
  status: 'indexed' | 'pending' | 'error';
  chunkCount: number;
  lastModified: string;
  error?: string;
}

/**
 * Chunks storage structure
 */
export interface ChunksStorage {
  version: string;
  userId: string;
  chunks: VectorChunk[];
}

/**
 * Document processing result
 */
export interface ProcessedDocument {
  filename: string;
  text: string;
  fileHash: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'unknown';
}

/**
 * Chunking result
 */
export interface ChunkingResult {
  chunks: Chunk[];
  totalChunks: number;
}

/**
 * Individual chunk before embedding
 */
export interface Chunk {
  text: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
}

/**
 * Retrieval result
 */
export interface RetrievalResult {
  chunks: VectorChunk[];
  scores: number[];
  queryEmbedding: number[];
}
