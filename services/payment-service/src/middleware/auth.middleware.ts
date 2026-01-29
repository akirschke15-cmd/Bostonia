import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js';
import { AppError } from './error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { prisma, type User as DbUser } from '@bostonia/database';

// Extend Express Request type
export interface AuthenticatedRequest extends Request {
  authUser?: TokenPayload & { dbUser?: DbUser };
}

export function authenticate(options: { loadUser?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Get token from header
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 'No token provided');
      }

      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);

      // Attach to request
      (req as AuthenticatedRequest).authUser = payload;

      // Optionally load full user from DB
      if (options.loadUser) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
        });

        if (!user) {
          throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
        }

        if (user.status !== 'ACTIVE') {
          throw new AppError(ErrorCodes.FORBIDDEN, 'Account is not active');
        }

        (req as AuthenticatedRequest).authUser!.dbUser = user;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.authUser) {
      return next(new AppError(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    if (!roles.includes(authReq.authUser.role)) {
      return next(new AppError(ErrorCodes.FORBIDDEN, 'Insufficient permissions'));
    }

    next();
  };
}

// Internal service authentication via API key
const INTERNAL_SERVICE_KEY = process.env['INTERNAL_SERVICE_KEY'] || 'dev-internal-key';

export function internalServiceAuth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-internal-service-key'];

    if (apiKey !== INTERNAL_SERVICE_KEY) {
      return next(new AppError(ErrorCodes.UNAUTHORIZED, 'Invalid service key'));
    }

    next();
  };
}
