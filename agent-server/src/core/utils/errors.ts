/**
 * Custom Error Classes
 * 
 * Provides structured error handling with error codes and context
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, true, details);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND_ERROR', 404, true, { resource, identifier });
  }
}

/**
 * Service error base class (500)
 */
export class ServiceError extends AppError {
  constructor(
    serviceName: string,
    message: string,
    details?: Record<string, any>
  ) {
    super(
      message,
      `${serviceName.toUpperCase()}_SERVICE_ERROR`,
      500,
      true,
      { serviceName, ...details }
    );
  }
}

/**
 * Embedding service error
 */
export class EmbeddingServiceError extends ServiceError {
  constructor(message: string, details?: Record<string, any>) {
    super('Embedding', message, details);
  }
}

/**
 * Indexing service error
 */
export class IndexingServiceError extends ServiceError {
  constructor(message: string, details?: Record<string, any>) {
    super('Indexing', message, details);
  }
}

/**
 * Retrieval service error
 */
export class RetrievalServiceError extends ServiceError {
  constructor(message: string, details?: Record<string, any>) {
    super('Retrieval', message, details);
  }
}

/**
 * Repository error
 */
export class RepositoryError extends AppError {
  constructor(
    repositoryName: string,
    message: string,
    details?: Record<string, any>
  ) {
    super(
      message,
      `${repositoryName.toUpperCase()}_REPOSITORY_ERROR`,
      500,
      true,
      { repositoryName, ...details }
    );
  }
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
