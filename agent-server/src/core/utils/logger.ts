/**
 * Structured Logging Service
 * 
 * Provides production-grade logging with Winston
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AppConfig } from '../config/index.js';
import { existsSync, mkdirSync } from 'fs';

let loggerInstance: winston.Logger | null = null;

/**
 * Create and configure Winston logger
 */
export function createLogger(config: AppConfig): winston.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const { logging } = config;

  // Ensure log directory exists
  if (!existsSync(logging.logDir)) {
    mkdirSync(logging.logDir, { recursive: true });
  }

  const transports: winston.transport[] = [
    // Console transport (always enabled)
    new winston.transports.Console({
      format: logging.format === 'json'
        ? winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          )
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          )
    }),

    // Application log file (all levels)
    new DailyRotateFile({
      filename: `${logging.logDir}/app-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: logging.maxFileSize,
      maxFiles: logging.maxFiles,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    }),

    // Error log file (only errors)
    new DailyRotateFile({
      filename: `${logging.logDir}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: logging.maxFileSize,
      maxFiles: '30d', // Keep error logs longer
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ];

  loggerInstance = winston.createLogger({
    level: logging.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
    transports,
    // Don't exit on handled exceptions
    exitOnError: false
  });

  return loggerInstance;
}

/**
 * Get the logger instance
 */
export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call createLogger() first.');
  }
  return loggerInstance;
}

/**
 * Logger helper functions with context
 */
export const logger = {
  debug: (message: string, meta?: Record<string, any>) => {
    const logger = getLogger();
    logger.debug(message, meta);
  },
  info: (message: string, meta?: Record<string, any>) => {
    const logger = getLogger();
    logger.info(message, meta);
  },
  warn: (message: string, meta?: Record<string, any>) => {
    const logger = getLogger();
    logger.warn(message, meta);
  },
  error: (message: string, error?: Error | any, meta?: Record<string, any>) => {
    const logger = getLogger();
    if (error instanceof Error) {
      logger.error(message, { ...meta, error: error.message, stack: error.stack });
    } else {
      logger.error(message, { ...meta, error });
    }
  }
};
