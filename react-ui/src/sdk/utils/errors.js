/**
 * Custom Error Classes
 * 
 * Specialized error types for better error handling
 */

import { ERROR_CODES } from '../types/index.js';

/**
 * Base SDK Error
 */
export class SDKError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Initialization Error
 */
export class InitializationError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.NOT_INITIALIZED, details);
    this.name = 'InitializationError';
  }
}

/**
 * Upload Error
 */
export class UploadError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.UPLOAD_FAILED, details);
    this.name = 'UploadError';
  }
}

/**
 * Analysis/Solve Error
 */
export class SolveError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.SOLVE_FAILED, details);
    this.name = 'SolveError';
  }
}

/**
 * Network Error
 */
export class NetworkError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.NETWORK_ERROR, details);
    this.name = 'NetworkError';
  }
}

/**
 * Session Error
 */
export class SessionError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.NO_SESSION, details);
    this.name = 'SessionError';
  }
}

/**
 * Validation Error
 */
export class ValidationError extends SDKError {
  constructor(message, details) {
    super(message, ERROR_CODES.INVALID_METHOD, details);
    this.name = 'ValidationError';
  }
}

/**
 * Create appropriate error from response
 */
export function createErrorFromResponse(response, defaultMessage = 'Request failed') {
  const status = response.status;
  const statusText = response.statusText;
  
  if (status >= 500) {
    return new NetworkError(`Backend error: ${statusText}`, { status, statusText });
  } else if (status >= 400) {
    return new ValidationError(`Client error: ${statusText}`, { status, statusText });
  } else {
    return new SDKError(defaultMessage, ERROR_CODES.BACKEND_ERROR, { status, statusText });
  }
}