/**
 * SDK Types and Constants
 * 
 * Centralized definitions for the XFlow SDK
 */

// Analysis methods
export const ANALYSIS_METHODS = {
  DC: 'dc',
  FNSL: 'fnsl',
  FDNS: 'fdns',
};

// Event types
export const SDK_EVENTS = {
  INITIALIZED: 'initialized',
  
  // Solve flow events
  SOLVE_FLOW_START: 'solveflow:start',
  SOLVE_FLOW_COMPLETE: 'solveflow:complete',
  SOLVE_FLOW_ERROR: 'solveflow:error',
  
  // Edit events
  EDIT_START: 'edit:start',
  EDIT_COMPLETE: 'edit:complete',
  EDIT_ERROR: 'edit:error',
  
  // Session events
  SESSION_CREATED: 'session:created',
  SESSION_CLEARED: 'session:cleared',
  SESSION_CHANGED: 'session:changed',
  
  // Network events
  NETWORK_UPDATED: 'network:updated',
  
  // File events
  FILE_DELETED: 'file:deleted',
  
  // System events
  HEALTH_CHECK: 'health:check',
  RESET: 'reset',
  ERROR: 'error',
  
  // Logging events
  LOG: 'log',
};

// API endpoints
export const API_ENDPOINTS = {
  // System
  HEALTH: '/health',  // Note: health is at root, not under /api/v1
  STATS: '/api/v1/stat',
  
  // User File Management
  USER_UPLOAD: '/api/v1/user/upload',
  USER_FILES: '/api/v1/user/files',
  USER_FILES_DOWNLOAD: '/api/v1/user/files/download',
  USER_FILES_DELETE: '/api/v1/user/files/delete',
  USER_FILE_INFO: '/api/v1/user/files',
  
  // Session Lifecycle Management
  SESSION_CREATE: '/api/v1/session',
  SESSION_INFO: '/api/v1/session/info',
  SESSION_LOAD_CASE: '/api/v1/session/load-case',
  SESSION_SAVE_CASE: '/api/v1/session/save-case',
  SESSION_SAVE_CASE_AS: '/api/v1/session/save-case-as',
  USER_SESSIONS: '/api/v1/user/sessions',

  // Session Study Files (.sub/.mon/.con)
  SESSION_LOAD_SUB: '/api/v1/session/load-sub',
  SESSION_LOAD_MON: '/api/v1/session/load-mon',
  SESSION_LOAD_CON: '/api/v1/session/load-con',
  SESSION_STUDY_VALIDATE: '/api/v1/session/study/validate',
  
  // Session Model Operations
  SESSION_NETWORK: '/api/v1/session/network',
  SESSION_SOLVE_FLOW: '/api/v1/session/solve-flow',
  SESSION_POWERFLOW: '/api/v1/session/powerflow',
  SESSION_EDIT: '/api/v1/session/edit',

  // AC Contingency Analysis (async jobs)
  SESSION_CONTINGENCY: '/api/v1/session/analysis/contingency',
  ANALYSIS_JOBS: '/api/v1/analysis/jobs',

  // Study-result history (durable, per-user)
  STUDY_RESULTS: '/api/v1/user/study-results',
};

// Status codes
export const STATUS = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  UPLOADING: 'uploading',
  ANALYZING: 'analyzing',
  ERROR: 'error',
};

// Error codes
export const ERROR_CODES = {
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  NO_SESSION: 'NO_SESSION',
  NO_FILE: 'NO_FILE',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  SOLVE_FAILED: 'SOLVE_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_METHOD: 'INVALID_METHOD',
  BACKEND_ERROR: 'BACKEND_ERROR',
};

// Configuration defaults
export const DEFAULT_CONFIG = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  autoReconnect: true,
};

export default {
  ANALYSIS_METHODS,
  SDK_EVENTS,
  API_ENDPOINTS,
  STATUS,
  ERROR_CODES,
  DEFAULT_CONFIG,
};