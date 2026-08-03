/**
 * File Watcher Service
 * 
 * Handles file system watching for knowledge base files
 */

import { watch, FSWatcher } from 'chokidar';
import { join } from 'path';
import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { IndexingService } from './indexing.service.js';
import { IIndexMetadataRepository } from '../repositories/interfaces.js';
import { logger } from '@core/utils/logger.js';
import { AppConfig } from '@core/config/index.js';

export class FileWatcherService {
  private config: AppConfig;
  private indexingService: IndexingService;
  private indexMetadataRepo: IIndexMetadataRepository;
  private watchers: Map<string, FSWatcher> = new Map();
  private fileHashes: Map<string, Map<string, string>> = new Map(); // userId -> filename -> hash
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // Files to ignore (system files, hidden files, etc.)
  private readonly IGNORED_FILES = new Set([
    '.DS_Store',
    'Thumbs.db',
    '.gitignore',
    '.git',
    '.svn',
    '.hg'
  ]);

  // File extensions to ignore
  private readonly IGNORED_EXTENSIONS = new Set([
    '.tmp',
    '.temp',
    '.log',
    '.lock'
  ]);

  constructor(
    config: AppConfig,
    indexingService: IndexingService,
    indexMetadataRepo: IIndexMetadataRepository
  ) {
    this.config = config;
    this.indexingService = indexingService;
    this.indexMetadataRepo = indexMetadataRepo;
  }

  /**
   * Check if a file should be ignored
   */
  private shouldIgnoreFile(filename: string): boolean {
    // Ignore hidden files (starting with .)
    if (filename.startsWith('.')) {
      return true;
    }

    // Check ignored files list
    if (this.IGNORED_FILES.has(filename)) {
      return true;
    }

    // Check ignored extensions
    const ext = filename.substring(filename.lastIndexOf('.'));
    if (this.IGNORED_EXTENSIONS.has(ext.toLowerCase())) {
      return true;
    }

    // Only process supported file types
    const supportedExts = ['.pdf', '.docx', '.txt'];
    const fileExt = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    if (!supportedExts.includes(fileExt)) {
      return true;
    }

    return false;
  }

  /**
   * Initialize file watchers for all existing user directories
   */
  async initialize(): Promise<void> {
    if (!this.config.knowledgeBase.enableFileWatcher) {
      logger.info('File watcher disabled in configuration');
      return;
    }

    // basePath from config is already resolved to absolute path
    const basePath = this.config.knowledgeBase.basePath;

    if (!existsSync(basePath)) {
      logger.debug('Knowledge base directory does not exist, skipping watcher initialization', {
        basePath: this.config.knowledgeBase.basePath,
        resolvedBasePath: basePath
      });
      return;
    }

    try {
      const userDirs = await readdir(basePath, { withFileTypes: true });
      
      for (const dir of userDirs) {
        if (dir.isDirectory()) {
          // Watch directory for future changes
          await this.watchUserDirectory(dir.name);
        }
      }

      // Also watch the base directory for new user directories
      await this.watchBaseDirectory(basePath);

      logger.info('File watchers initialized', {
        userCount: this.watchers.size
      });
    } catch (error: any) {
      logger.error('Failed to initialize file watchers', error, { basePath });
    }
  }

  /**
   * Watch the base directory for new user directories
   * This is a fallback for when users are registered via API
   * basePath should already be resolved to absolute path
   */
  private async watchBaseDirectory(basePath: string): Promise<void> {
    const baseWatcher = watch(basePath, {
      ignored: /\.index/,
      ignoreInitial: true,
      persistent: true,
      depth: 1 // Only watch immediate subdirectories
    });

    // Watch for new user directories (fallback - primary method is via API)
    baseWatcher.on('addDir', async (dirPath: string) => {
      const dirName = dirPath.split(/[/\\]/).pop() || dirPath;
      const fullPath = dirPath.startsWith('/') ? dirPath : join(basePath, dirName);
      
      // Check if it's a directory and not already watched
      if (existsSync(fullPath) && !this.watchers.has(dirName)) {
        logger.info('New user directory detected via base watcher, starting watcher', {
          userId: dirName,
          path: fullPath
        });
        await this.watchUserDirectory(dirName);
      }
    });

    logger.debug('Base directory watcher started (fallback)', { basePath });
  }

  /**
   * Watch a user's knowledge base directory
   * Creates the directory if it doesn't exist
   */
  async watchUserDirectory(userId: string): Promise<void> {
    if (this.watchers.has(userId)) {
      logger.debug('Watcher already exists for user', { userId });
      return;
    }

    // basePath from config is already resolved to absolute path
    // Just join with userId to get user directory
    const userPath = join(this.config.knowledgeBase.basePath, userId);
    
    logger.info('Setting up file watcher', {
      userId,
      basePath: this.config.knowledgeBase.basePath,
      userPath: userPath
    });

    // Create directory if it doesn't exist (user might not have uploaded files yet)
    if (!existsSync(userPath)) {
      try {
        const { mkdir } = await import('fs/promises');
        await mkdir(userPath, { recursive: true });
        logger.info('Created user knowledge base directory', { userId, path: userPath });
      } catch (error: any) {
        logger.error('Failed to create user directory', error, { userId, path: userPath });
        throw error;
      }
    }

    // Initialize file hash tracking
    this.fileHashes.set(userId, new Map());
    await this.initializeFileHashes(userId);

    // Create watcher (ignore .index directory and system files)
    const watcher = watch(userPath, {
      ignored: [
        /\.index/,
        /^\./,  // Ignore hidden files (starting with .)
        /\.DS_Store$/,
        /Thumbs\.db$/,
        /\.tmp$/,
        /\.temp$/,
        /\.log$/
      ],
      ignoreInitial: true,
      persistent: true
    });

    watcher
      .on('add', (filePath) => {
        logger.info('Chokidar add event received', { userId, filePath, userPath, absolutePath: join(userPath, filePath) });
        this.handleFileChange(userId, filePath, 'add');
      })
      .on('change', (filePath) => {
        logger.info('Chokidar change event received', { userId, filePath, userPath, absolutePath: join(userPath, filePath) });
        this.handleFileChange(userId, filePath, 'change');
      })
      .on('unlink', (filePath) => {
        logger.info('Chokidar unlink event received', { userId, filePath, userPath });
        this.handleFileDeleted(userId, filePath);
      })
      .on('error', (error) => {
        logger.error('Chokidar watcher error', error, { userId, userPath });
      })
      .on('ready', () => {
        logger.info('Chokidar watcher ready', { userId, userPath });
      });

    this.watchers.set(userId, watcher);

    // Verify the directory exists and is accessible
    if (!existsSync(userPath)) {
      logger.error('Cannot watch directory - does not exist', { userId, userPath });
      throw new Error(`User directory does not exist: ${userPath}`);
    }
    
    logger.info('File watcher started and monitoring file system', { 
      userId, 
      path: userPath,
      absolutePath: userPath,
      watcherCount: this.watchers.size,
      note: 'File system monitoring is active - files added to this directory will be automatically indexed'
    });
  }

  /**
   * Stop watching a user's directory
   */
  async unwatchUserDirectory(userId: string): Promise<void> {
    const watcher = this.watchers.get(userId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(userId);
      this.fileHashes.delete(userId);
      
      const timer = this.debounceTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(userId);
      }

      logger.info('File watcher stopped', { userId });
    }
  }

  /**
   * Handle file change (add or modify)
   */
  private async handleFileChange(userId: string, filePath: string, event: 'add' | 'change'): Promise<void> {
    // Chokidar gives us paths relative to the watched directory when watching a specific directory
    // So filePath is typically just the filename (relative to user directory)
    // Extract just the filename in case it's an absolute path
    let filename: string;
    if (filePath.startsWith('/') || filePath.includes(this.config.knowledgeBase.basePath)) {
      // Absolute path - extract just the filename
      filename = filePath.split(/[/\\]/).pop() || filePath;
    } else {
      // Relative path (chokidar default when watching a directory)
      filename = filePath.split(/[/\\]/).pop() || filePath;
    }
    
    logger.info('File change event detected', {
      userId,
      filename,
      event,
      originalFilePath: filePath
    });
    
    // Skip ignored files
    if (this.shouldIgnoreFile(filename)) {
      logger.info('Ignoring file change (system/unsupported file)', {
        userId,
        filename,
        event,
        reason: 'File is ignored by shouldIgnoreFile check'
      });
      return;
    }
    
    logger.debug('File passed ignore check, proceeding with indexing', {
      userId,
      filename,
      event
    });
    
    // Construct absolute path only for file operations
    // basePath from config is already resolved to absolute path
    const userPath = join(this.config.knowledgeBase.basePath, userId);
    const absolutePath = join(userPath, filename);
    
    // Verify file exists before processing
    if (!existsSync(absolutePath)) {
      logger.warn('File does not exist, may still be uploading', {
        userId,
        filename
      });
      // Wait a bit and retry for 'add' events (file might still be uploading)
      if (event === 'add') {
        setTimeout(async () => {
          if (existsSync(absolutePath)) {
            // Retry with the same filePath
            await this.handleFileChange(userId, filePath, event);
          } else {
            logger.warn('File still does not exist after retry', {
              userId,
              filename
            });
          }
        }, 2000); // Wait 2 seconds and retry
      }
      return;
    }
    
    // Debounce rapid file changes
    const timerKey = `${userId}:${filename}`;
    const existingTimer = this.debounceTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        // Construct absolute path only for file operations
        // basePath from config is already resolved to absolute path
        const userPath = join(this.config.knowledgeBase.basePath, userId);
        const absolutePath = join(userPath, filename);
        
        // For 'add' events (new files), always index regardless of hash
        // This ensures uploaded files are always indexed
        if (event === 'add') {
          logger.info('New file detected, triggering indexing', {
            userId,
            filename,
            event
          });

          try {
            // Use filename (relative path) for indexing
            await this.indexingService.indexDocument(userId, filename, filename);
            
            // Update stored hash after successful indexing (use absolute path for file operations)
            const currentHash = await this.calculateFileHash(absolutePath);
            this.fileHashes.get(userId)?.set(filename, currentHash);
            
            logger.info('New file indexed successfully', {
              userId,
              filename
            });
          } catch (indexError: any) {
            logger.error('Failed to index new file', indexError, {
              userId,
              filename,
              event
            });
          }
          return;
        }

        // For 'change' events, check hash to avoid unnecessary re-indexing
        const currentHash = await this.calculateFileHash(absolutePath);
        const storedHash = this.fileHashes.get(userId)?.get(filename);

        // Only index if hash changed
        if (currentHash !== storedHash) {
          logger.info('File changed, triggering indexing', {
            userId,
            filename,
            event,
            oldHash: storedHash?.substring(0, 8) + '...',
            newHash: currentHash.substring(0, 8) + '...'
          });

          // Use filename (relative path) for indexing
          await this.indexingService.indexDocument(userId, filename, filename);
          
          // Update stored hash
          this.fileHashes.get(userId)?.set(filename, currentHash);
        } else {
          logger.debug('File hash unchanged, skipping indexing', {
            userId,
            filename
          });
        }
      } catch (error: any) {
        logger.error('Failed to handle file change', error, {
          userId,
          filename,
          event
        });
      } finally {
        this.debounceTimers.delete(timerKey);
      }
    }, 1000); // 1 second debounce

    this.debounceTimers.set(timerKey, timer);
  }

  /**
   * Handle file deletion
   */
  private async handleFileDeleted(userId: string, filePath: string): Promise<void> {
    const filename = filePath.split(/[/\\]/).pop() || filePath;
    
    logger.info('File deleted, cleaning up chunks and metadata', { userId, filename });
    
    // Skip ignored files
    if (this.shouldIgnoreFile(filename)) {
      logger.info('Ignoring file deletion (system/unsupported file)', {
        userId,
        filename,
        reason: 'File is ignored by shouldIgnoreFile check'
      });
      return;
    }
    
    try {
      // Delete chunks (NDJSON file) and metadata
      // This is instant since each document has its own NDJSON file
      await this.indexingService.deleteDocument(userId, filename);
      
      // Remove from hash tracking
      this.fileHashes.get(userId)?.delete(filename);
      
      logger.info('File deletion cleanup completed', { userId, filename });
    } catch (error: any) {
      logger.error('Failed to cleanup deleted file', error, { userId, filename });
      // Don't throw - file is already deleted, cleanup failure is not critical
    }
  }

  /**
   * Initialize file hashes for a user and retry failed files
   */
  private async initializeFileHashes(userId: string): Promise<void> {
    // basePath from config is already resolved to absolute path
    const userPath = join(this.config.knowledgeBase.basePath, userId);
    const hashMap = this.fileHashes.get(userId);

    if (!hashMap) {
      return;
    }

    try {
      const files = await readdir(userPath, { withFileTypes: true });

      // Get current indexing status to check for error files
      const metadata = await this.indexMetadataRepo.getMetadata(userId);
      const indexingStatus = metadata?.indexingStatus || {};
      const errorFiles: string[] = [];

      for (const file of files) {
        if (file.isFile() && !this.shouldIgnoreFile(file.name)) {
          const filePath = join(userPath, file.name);
          try {
            const hash = await this.calculateFileHash(filePath);
            hashMap.set(file.name, hash);

            // Check if this file has error status and needs retry
            const fileStatus = indexingStatus[file.name];
            if (fileStatus?.status === 'error') {
              errorFiles.push(file.name);
            }
          } catch (error) {
            // Ignore errors for individual files
            logger.debug('Failed to calculate hash for file', {
              userId,
              filename: file.name,
              error
            });
          }
        }
      }

      // Retry indexing for files with error status
      if (errorFiles.length > 0) {
        logger.info('Retrying indexing for files with error status', {
          userId,
          errorFiles,
          count: errorFiles.length
        });

        // Trigger re-indexing for each error file (with delay to avoid overwhelming)
        for (const filename of errorFiles) {
          try {
            await this.indexingService.indexDocument(userId, filename, filename);
            logger.info('Successfully re-indexed previously failed file', {
              userId,
              filename
            });
          } catch (error: any) {
            logger.error('Failed to re-index file with error status', error, {
              userId,
              filename
            });
          }
        }
      }
    } catch (error: any) {
      logger.error('Failed to initialize file hashes', error, { userId });
    }
  }

  /**
   * Calculate file hash (uses absolute path internally for file I/O)
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    // filePath can be absolute or relative - readFile handles both, but we'll ensure it's absolute
    const buffer = await readFile(filePath);
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Stop all watchers (for graceful shutdown)
   */
  async stopAll(): Promise<void> {
    const userIds = Array.from(this.watchers.keys());
    
    for (const userId of userIds) {
      await this.unwatchUserDirectory(userId);
    }

    logger.info('All file watchers stopped');
  }
}

