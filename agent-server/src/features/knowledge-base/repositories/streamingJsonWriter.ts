/**
 * Streaming JSON Writer
 * 
 * Writes JSON incrementally to avoid loading entire file into memory
 * Used for large chunk files to prevent OOM errors
 */

import { writeFile, readFile } from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import { join } from 'path';
import { VectorChunk, ChunksStorage } from '../models/index.js';
import { logger } from '@core/utils/logger.js';

export class StreamingJsonWriter {
  private chunksPath: string;
  private tempPath: string;
  private stream: WriteStream | null = null;
  private chunkCount: number = 0;
  private isFirstChunk: boolean = true;

  constructor(chunksPath: string) {
    this.chunksPath = chunksPath;
    this.tempPath = `${chunksPath}.tmp`;
  }

  /**
   * Start writing a new JSON file with userId
   */
  async start(userId: string): Promise<void> {
    this.stream = createWriteStream(this.tempPath, { encoding: 'utf-8' });
    this.chunkCount = 0;
    this.isFirstChunk = true;

    // Write opening of JSON structure with userId
    await this.writeString(`{"version":"1.0","userId":"${userId}","chunks":[`);
  }

  /**
   * Write a single chunk (streaming)
   */
  async writeChunk(chunk: VectorChunk): Promise<void> {
    if (!this.stream) {
      throw new Error('Stream not started. Call start() first.');
    }

    // Write comma before chunk (except first)
    if (!this.isFirstChunk) {
      await this.writeString(',');
    }
    this.isFirstChunk = false;

    // Write chunk as JSON (compact, no pretty printing)
    const chunkJson = JSON.stringify(chunk);
    await this.writeString(chunkJson);
    this.chunkCount++;
  }

  /**
   * Write multiple chunks (streaming)
   */
  async writeChunks(chunks: VectorChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.writeChunk(chunk);
    }
  }

  /**
   * Finish writing and close the file
   */
  async finish(): Promise<void> {
    if (!this.stream) {
      throw new Error('Stream not started. Call start() first.');
    }

    // Close chunks array and JSON object
    await this.writeString(']}');

    // Close the stream
    await new Promise<void>((resolve, reject) => {
      this.stream!.end((err: Error | null | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.stream = null;
  }

  /**
   * Commit the file (rename temp to final)
   */
  async commit(): Promise<void> {
    const { rename } = await import('fs/promises');
    await rename(this.tempPath, this.chunksPath);
    logger.debug('Streaming JSON write committed', { 
      path: this.chunksPath,
      chunkCount: this.chunkCount 
    });
  }

  /**
   * Abort and clean up temp file
   */
  async abort(): Promise<void> {
    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }

    try {
      const { unlink } = await import('fs/promises');
      await unlink(this.tempPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Write string to stream
   */
  private async writeString(str: string): Promise<void> {
    if (!this.stream) {
      throw new Error('Stream not started');
    }

    return new Promise((resolve, reject) => {
      const canWrite = this.stream!.write(str, (err) => {
        if (err) reject(err);
        else resolve();
      });

      if (!canWrite) {
        this.stream!.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Get chunk count written so far
   */
  getChunkCount(): number {
    return this.chunkCount;
  }
}

/**
 * Streaming JSON Reader
 * 
 * Reads JSON incrementally to avoid loading entire file into memory
 */
export class StreamingJsonReader {
  /**
   * Read chunks one at a time using a generator
   * This allows processing chunks without loading all into memory
   * IMPORTANT: This still loads the entire file into memory for JSON parsing
   * For truly streaming, we'd need a streaming JSON parser, but that's complex
   * This is a compromise - we parse once, then yield chunks one at a time
   */
  static async *readChunksStreaming(chunksPath: string): AsyncGenerator<VectorChunk, void, unknown> {
    let data: string | null = null;
    let storage: ChunksStorage | null = null;
    
    try {
      data = await readFile(chunksPath, 'utf-8');
      storage = JSON.parse(data);
      
      // Clear the data string immediately after parsing to help GC
      data = null;
      
      // Yield chunks one at a time
      if (storage) {
        const chunks = storage.chunks || [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          yield chunk;
          
          // Clear chunk from array to help GC (set to null)
          chunks[i] = null as any;
          
          // Periodically force GC hint
          if (i % 100 === 0 && global.gc) {
            global.gc();
          }
        }
        
        // Clear storage object
        storage = null;
      }
    } catch (error: any) {
      // Clear references on error
      data = null;
      storage = null;
      
      if (error.code === 'ENOENT') {
        // File doesn't exist, that's okay
        return;
      }
      throw error;
    }
  }

  /**
   * Filter chunks by condition without loading all into memory
   */
  static async filterChunks(
    chunksPath: string,
    filterFn: (chunk: VectorChunk) => boolean
  ): Promise<VectorChunk[]> {
    const filtered: VectorChunk[] = [];
    
    for await (const chunk of this.readChunksStreaming(chunksPath)) {
      if (filterFn(chunk)) {
        filtered.push(chunk);
      }
    }
    
    return filtered;
  }

  /**
   * Count chunks without loading all into memory
   */
  static async countChunks(chunksPath: string): Promise<number> {
    let count = 0;
    for await (const chunk of this.readChunksStreaming(chunksPath)) {
      count++;
    }
    return count;
  }
}

