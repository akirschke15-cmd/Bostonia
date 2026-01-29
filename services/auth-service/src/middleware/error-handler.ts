import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorResponse, ErrorCodes, ErrorCodeToStatus } from '@bostonia/shared';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(err, 'Request error');

  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {} as Record<string, string>);

    return res.status(400).json(
      errorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', details)
    );
  }

  // Application errors
  if (err instanceof AppError) {
    const status = ErrorCodeToStatus[err.code] || 500;
    return res.status(status).json(
      errorResponse(err.code, err.message, err.details)
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(
      errorResponse(ErrorCodes.INVALID_TOKEN, 'Invalid token')
    );
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json(
      errorResponse(ErrorCodes.TOKEN_EXPIRED, 'Token expired')
    );
  }

  // Default error
  return res.status(500).json(
    errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
    )
  );
}
