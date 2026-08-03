/**
 * Configuration Management
 * 
 * Handles loading and validation of environment variables and application configuration
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, copyFileSync } from 'fs';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface KnowledgeBaseConfig {
  embeddingModel: string;
  embeddingBaseUrl: string;   // Base URL for embedding API (required - set to OpenAI or custom provider)
  embeddingApiKey?: string;   // Separate API key for embeddings (optional, falls back to openaiApiKey)
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  basePath: string;
  enableFileWatcher: boolean;
}

export interface LoggingConfig {
  level: string;
  format: 'json' | 'simple';
  enableRequestLogging: boolean;
  logDir: string;
  maxFileSize: string;
  maxFiles: string;
}

export interface ServiceAuthConfig {
  enabled: boolean;
  secret: string;
  apiServerUrl: string;
  defaultUserId?: string;
}

export interface BrainConfig {
  enabled: boolean;
  maxRounds: number;
  maxTokens: number;
}

export interface AppConfig {
  port: number;
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl?: string;
  logLevel: string;
  appEnv: 'development' | 'production' | 'test';
  knowledgeBase: KnowledgeBaseConfig;
  logging: LoggingConfig;
  serviceAuth: ServiceAuthConfig;
  brain: BrainConfig;
}

/**
 * Load and validate environment variables
 */
export function loadConfig(): AppConfig {
  const envPath = join(process.cwd(), '.env');
  // Check for both .env.example (standard) and env.example (legacy)
  const envExamplePath = join(process.cwd(), '.env.example');
  const envExamplePathLegacy = join(process.cwd(), 'env.example');

  // If .env doesn't exist but example file does, copy it
  if (!existsSync(envPath)) {
    let examplePath: string | null = null;
    if (existsSync(envExamplePath)) {
      examplePath = envExamplePath;
    } else if (existsSync(envExamplePathLegacy)) {
      examplePath = envExamplePathLegacy;
    }

    if (examplePath) {
      console.log('[Config] ℹ️  .env file not found, copying from example file...');
      copyFileSync(examplePath, envPath);
      console.log('[Config] ✅ Created .env file from example');
      console.log('[Config] ⚠️  Please edit .env and add your actual OpenAI API key!');
    }
  }

  // Load environment variables
  dotenv.config({ path: envPath });

  // Validate required variables
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('[Config] ❌ OPENAI_API_KEY is required. Please set it in your .env file.');
    console.error('[Config] 📝 Create a .env file in the agent-server directory with:');
    console.error('[Config]    OPENAI_API_KEY=your_api_key_here');
    console.error('[Config]    OPENAI_MODEL=gpt-4o');
    console.error('[Config]    PORT=3001');
    process.exit(1);
  }

  // Build knowledge base configuration
  // Resolve basePath to absolute path for production deployment
  // Supports both absolute paths (for production) and relative paths (for development)
  let basePath = process.env.KB_BASE_PATH || join(process.cwd(), '../user-data/knowledge');
  
  // If not absolute, resolve relative to process.cwd()
  // This ensures it works in both development and production
  if (!basePath.startsWith('/') && !basePath.match(/^[A-Z]:/)) { // Not absolute (Unix) or Windows drive
    basePath = resolve(process.cwd(), basePath);
  } else {
    // Already absolute, just normalize it
    basePath = resolve(basePath);
  }
  
  const knowledgeBaseConfig: KnowledgeBaseConfig = {
    embeddingModel: process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingBaseUrl: process.env.KB_EMBEDDING_BASE_URL || 'https://api.openai.com/v1',
    embeddingApiKey: process.env.KB_EMBEDDING_API_KEY,
    chunkSize: parseInt(process.env.KB_CHUNK_SIZE || '800', 10),
    chunkOverlap: parseInt(process.env.KB_CHUNK_OVERLAP || '150', 10),
    topK: parseInt(process.env.KB_TOP_K || '3', 10),
    basePath: basePath, // Now always absolute
    enableFileWatcher: process.env.KB_ENABLE_FILE_WATCHER !== 'false'
  };

  // Validate knowledge base config
  if (knowledgeBaseConfig.chunkSize < 100 || knowledgeBaseConfig.chunkSize > 2000) {
    console.error('[Config] ❌ KB_CHUNK_SIZE must be between 100 and 2000');
    process.exit(1);
  }
  if (knowledgeBaseConfig.chunkOverlap < 0 || knowledgeBaseConfig.chunkOverlap >= knowledgeBaseConfig.chunkSize) {
    console.error('[Config] ❌ KB_CHUNK_OVERLAP must be >= 0 and < KB_CHUNK_SIZE');
    process.exit(1);
  }
  if (knowledgeBaseConfig.topK < 1 || knowledgeBaseConfig.topK > 20) {
    console.error('[Config] ❌ KB_TOP_K must be between 1 and 20');
    process.exit(1);
  }

  // Build logging configuration
  const loggingConfig: LoggingConfig = {
    level: process.env.LOG_LEVEL || (process.env.APP_ENV === 'production' ? 'info' : 'debug'),
    format: (process.env.LOG_FORMAT as 'json' | 'simple') || (process.env.APP_ENV === 'production' ? 'json' : 'simple'),
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    logDir: process.env.LOG_DIR || join(process.cwd(), 'logs'),
    maxFileSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d'
  };

  // Build service auth configuration
  const serviceAuthConfig: ServiceAuthConfig = {
    enabled: process.env.SERVICE_AUTH_ENABLED !== 'false',
    secret: process.env.SERVICE_AUTH_SECRET || '',
    apiServerUrl: process.env.API_SERVER_URL || 'http://localhost:8080',
    defaultUserId: process.env.DEFAULT_USER_ID,
  };

  // Validate service auth config
  if (serviceAuthConfig.enabled && !serviceAuthConfig.secret) {
    console.warn('[Config] ⚠️  SERVICE_AUTH_SECRET not set, service authentication will be disabled');
    serviceAuthConfig.enabled = false;
  }

  // Build brain configuration
  const brainConfig: BrainConfig = {
    enabled: process.env.ENABLE_BRAIN === 'true',
    maxRounds: parseInt(process.env.BRAIN_MAX_ROUNDS || '50', 10),
    maxTokens: parseInt(process.env.BRAIN_MAX_TOKENS || '100000', 10),
  };

  // Build configuration object
  const config: AppConfig = {
    port: parseInt(process.env.PORT || '3001', 10),
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    logLevel: loggingConfig.level,
    appEnv: (process.env.APP_ENV as any) || 'development',
    knowledgeBase: knowledgeBaseConfig,
    logging: loggingConfig,
    serviceAuth: serviceAuthConfig,
    brain: brainConfig,
  };

  // Validate port
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    console.error(`[Config] ❌ Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535.`);
    process.exit(1);
  }

  console.log('[Config] ✅ Configuration loaded');
  console.log(`[Config] 📡 Using model: ${config.openaiModel}`);
  console.log(`[Config] 🌍 Environment: ${config.appEnv}`);
  console.log(`[Config] 🔌 Port: ${config.port}`);
  console.log(`[Config] 📚 Knowledge Base: ${config.knowledgeBase.enableFileWatcher ? 'enabled' : 'disabled'}`);
  console.log(`[Config] 📝 Logging: ${config.logging.level} (${config.logging.format})`);
  console.log(`[Config] 🧠 Brain Mode: ${config.brain.enabled ? 'enabled' : 'disabled'}`);
  if (config.brain.enabled) {
    console.log(`[Config]    Max Rounds: ${config.brain.maxRounds}`);
    console.log(`[Config]    Max Tokens: ${config.brain.maxTokens}`);
  }
  console.log(`[Config] 🔐 Service Auth: ${config.serviceAuth.enabled ? 'enabled' : 'disabled'}`);
  if (config.serviceAuth.enabled) {
    console.log(`[Config]    API Server: ${config.serviceAuth.apiServerUrl}`);
    if (config.serviceAuth.defaultUserId) {
      console.log(`[Config]    Default User: ${config.serviceAuth.defaultUserId}`);
    }
  }

  return config;
}

/**
 * Get configuration (singleton pattern)
 */
let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

