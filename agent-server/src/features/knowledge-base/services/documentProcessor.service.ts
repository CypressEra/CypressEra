/**
 * Document Processor Service
 * 
 * Handles text extraction from PDF and DOCX files
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';
// @ts-ignore - pdf-parse doesn't have type definitions
import pdfParse from 'pdf-parse';
// @ts-ignore - mammoth doesn't have type definitions
import mammoth from 'mammoth';
import { createHash } from 'crypto';
import { ProcessedDocument } from '../models/index.js';
import { ServiceError } from '@core/utils/errors.js';
import { logger } from '@core/utils/logger.js';

export class DocumentProcessorService {
  /**
   * Process a document file and extract text
   */
  async processDocument(filePath: string, filename: string): Promise<ProcessedDocument> {
    let fileBuffer: Buffer | null = null;
    try {
      fileBuffer = await readFile(filePath);
      const fileHash = this.calculateFileHash(fileBuffer);
      const fileType = this.detectFileType(filename);

      const memBefore = process.memoryUsage();
      logger.debug('Processing document', { 
        filename, 
        fileType, 
        filePath,
        fileSize: Math.round(fileBuffer.length / 1024) + ' KB',
        heapUsed: Math.round(memBefore.heapUsed / 1024 / 1024) + ' MB'
      });

      let text: string;

      switch (fileType) {
        case 'pdf':
          text = await this.extractFromPDF(fileBuffer);
          break;
        case 'docx':
          text = await this.extractFromDOCX(fileBuffer);
          break;
        case 'txt':
          text = fileBuffer.toString('utf-8');
          break;
        default:
          throw new ServiceError(
            'DocumentProcessor',
            `Unsupported file type: ${fileType}`,
            { filename, fileType }
          );
      }

      // Clear fileBuffer immediately after extraction (critical for memory)
      fileBuffer = null;
      
      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      if (!text || text.trim().length === 0) {
        throw new ServiceError(
          'DocumentProcessor',
          'Document contains no extractable text',
          { filename }
        );
      }

      const memAfter = process.memoryUsage();
      logger.info('Document processed successfully', {
        filename,
        fileType,
        textLength: text.length,
        hash: fileHash.substring(0, 8) + '...',
        heapUsed: Math.round(memAfter.heapUsed / 1024 / 1024) + ' MB',
        heapDelta: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024) + ' MB'
      });

      return {
        filename,
        text: text.trim(),
        fileHash,
        fileType
      };
    } catch (error: any) {
      // Clear buffer on error
      fileBuffer = null;
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError(
        'DocumentProcessor',
        `Failed to process document: ${error.message}`,
        { filename, filePath, error: error.message }
      );
    }
  }

  /**
   * Extract text from PDF
   */
  private async extractFromPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      const text = data.text;
      
      // Clear PDF parse result immediately (data object can be large)
      // Note: Can't reassign const, but we can clear properties
      if (data && typeof data === 'object') {
        (data as any).text = null;
        (data as any).info = null;
        (data as any).metadata = null;
        (data as any).numpages = null;
      }
      
      // Force GC hint
      if (global.gc) {
        global.gc();
      }
      
      return text;
    } catch (error: any) {
      throw new ServiceError(
        'DocumentProcessor',
        `Failed to extract text from PDF: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Extract text from DOCX
   */
  private async extractFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error: any) {
      throw new ServiceError(
        'DocumentProcessor',
        `Failed to extract text from DOCX: ${error.message}`,
        { error: error.message }
      );
    }
  }

  /**
   * Detect file type from filename
   */
  private detectFileType(filename: string): 'pdf' | 'docx' | 'txt' | 'unknown' {
    const ext = extname(filename).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return 'pdf';
      case '.docx':
        return 'docx';
      case '.txt':
        return 'txt';
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate SHA-256 hash of file buffer
   */
  private calculateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}

