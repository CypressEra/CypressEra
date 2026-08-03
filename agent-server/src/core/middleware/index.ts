/**
 * Express Middleware
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger.js';
import { AppError, isOperationalError } from '../utils/errors.js';
import jwt from 'jsonwebtoken';

/**
 * Error handling middleware
 * Note: Must have 4 parameters to be recognized as error handler
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If response already sent, delegate to default handler
  if (res.headersSent) {
    return next(err);
  }

  // Log error
  if (err instanceof AppError) {
    logger.warn('Request error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      details: err.details
    });
  } else {
    // Non-operational errors are programming errors - log as error
    logger.error('Unhandled error', err, {
      path: req.path,
      method: req.method
    });
  }

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isOperational = isOperationalError(err);

  // Prepare error response
  const errorResponse: any = {
    success: false,
    error: err.message || 'Internal server error'
  };

  // Add error code if it's an AppError
  if (err instanceof AppError) {
    errorResponse.code = err.code;
    if (err.details && Object.keys(err.details).length > 0) {
      errorResponse.details = err.details;
    }
  }

  // Don't expose internal errors in production
  if (!isOperational && process.env.APP_ENV === 'production') {
    errorResponse.error = 'Internal server error';
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip
    });
  });
  
  next();
}

/**
 * JWT-based authentication middleware.
 *
 * Expects Authorization: Bearer <token> header using the same secret as the api-server.
 * On success, attaches a minimal user object to req.user for downstream handlers.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization') || req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ success: false, error: 'Missing or invalid Authorization header', code: 'unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res
      .status(401)
      .json({ success: false, error: 'Missing access token', code: 'unauthorized' });
  }

  const secret = process.env.AUTH_JWT_SECRET || 'change-this-secret-in-prod';

  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    const userId = (decoded as any).uid || decoded.sub;
    const email = (decoded as any).email;
    const role = (decoded as any).role;

    if (!userId || typeof userId !== 'string') {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid access token', code: 'unauthorized' });
    }

    (req as AuthenticatedRequest).user = {
      id: userId,
      email: typeof email === 'string' ? email : '',
      role: typeof role === 'string' ? role : undefined,
    };

    return next();
  } catch (err: any) {
    logger.warn('JWT verification failed', { error: err?.message });
    return res
      .status(401)
      .json({ success: false, error: 'Invalid or expired access token', code: 'unauthorized' });
  }
}

