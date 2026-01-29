import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { apiKeyService, type ApiKeyScope, type ApiKeyWithUser } from '../services/api-key.service.js';
import { logger } from '../lib/logger.js';

// Extend Express Request type for API key authentication
export interface ApiKeyAuthenticatedRequest extends Request {
  apiKey?: ApiKeyWithUser;
  authUser?: {
    userId: string;
    email: string;
    username: string;
    role: string;
    dbUser?: {
      id: string;
      email: string;
      username: string;
      role: string;
      status: string;
      credits: number;
      subscriptionTier: string;
    };
  };
}

interface ApiKeyAuthOptions {
  /**
   * Required scopes for this endpoint
   */
  requiredScopes?: ApiKeyScope[];

  /**
   * Whether to allow both Bearer token and API key auth (default: true)
   * If false, only API key auth is allowed
   */
  allowBearerFallback?: boolean;

  /**
   * Whether to update lastUsedAt on successful auth (default: true)
   */
  updateLastUsed?: boolean;
}

/**
 * Middleware to authenticate requests using X-API-Key header
 *
 * Supports the X-API-Key header for API key authentication.
 * When an API key is valid, it loads the associated user for downstream authorization.
 */
export function authenticateApiKey(options: ApiKeyAuthOptions = {}) {
  const {
    requiredScopes = [],
    allowBearerFallback = true,
    updateLastUsed = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKeyHeader = req.headers['x-api-key'];
      const authHeader = req.headers.authorization;

      // Check for API key first
      if (apiKeyHeader && typeof apiKeyHeader === 'string') {
        const apiKeyResult = await validateApiKeyAuth(apiKeyHeader, requiredScopes, updateLastUsed);

        // Attach API key and user info to request
        const authReq = req as ApiKeyAuthenticatedRequest;
        authReq.apiKey = apiKeyResult;
        authReq.authUser = {
          userId: apiKeyResult.userId,
          email: apiKeyResult.user.email,
          username: apiKeyResult.user.username,
          role: apiKeyResult.user.role,
          dbUser: apiKeyResult.user,
        };

        return next();
      }

      // Fall back to Bearer token if allowed
      if (allowBearerFallback && authHeader?.startsWith('Bearer ')) {
        // Let the regular auth middleware handle it
        return next();
      }

      // No valid authentication provided
      throw new AppError(
        ErrorCodes.UNAUTHORIZED,
        'Authentication required. Provide X-API-Key header or Bearer token.'
      );
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate an API key and check required scopes
 */
async function validateApiKeyAuth(
  key: string,
  requiredScopes: ApiKeyScope[],
  updateLastUsed: boolean
): Promise<ApiKeyWithUser> {
  // Validate the key
  const apiKey = await apiKeyService.validateApiKey(key);

  if (!apiKey) {
    logger.warn({ keyPrefix: key.slice(0, 12) }, 'Invalid API key attempt');
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'Invalid API key');
  }

  // Check if key is active
  if (!apiKey.isActive) {
    logger.warn({ apiKeyId: apiKey.id }, 'Inactive API key used');
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'API key is inactive');
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    logger.warn({ apiKeyId: apiKey.id }, 'Expired API key used');
    throw new AppError(ErrorCodes.UNAUTHORIZED, 'API key has expired');
  }

  // Check user status
  if (apiKey.user.status !== 'ACTIVE') {
    logger.warn({ apiKeyId: apiKey.id, userId: apiKey.userId }, 'API key for inactive user');
    throw new AppError(ErrorCodes.FORBIDDEN, 'User account is not active');
  }

  // Check required scopes
  if (requiredScopes.length > 0) {
    const hasAllScopes = requiredScopes.every(scope => apiKey.scopes.includes(scope));
    if (!hasAllScopes) {
      logger.warn(
        { apiKeyId: apiKey.id, requiredScopes, keyScopes: apiKey.scopes },
        'API key missing required scopes'
      );
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        `API key missing required scopes: ${requiredScopes.join(', ')}`
      );
    }
  }

  // Update lastUsedAt (async, don't wait)
  if (updateLastUsed) {
    apiKeyService.updateLastUsed(apiKey.id).catch(err => {
      logger.error(err, 'Failed to update API key lastUsedAt');
    });
  }

  logger.debug({ apiKeyId: apiKey.id, userId: apiKey.userId }, 'API key authenticated');

  return apiKey;
}

/**
 * Middleware to require specific scopes for an endpoint
 * Use this after authenticateApiKey() to enforce scope requirements
 */
export function requireScopes(...scopes: ApiKeyScope[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as ApiKeyAuthenticatedRequest;

    // If not authenticated via API key, skip scope check
    // (Bearer token users have full access via their user role)
    if (!authReq.apiKey) {
      return next();
    }

    const hasAllScopes = scopes.every(scope => authReq.apiKey!.scopes.includes(scope));
    if (!hasAllScopes) {
      return next(
        new AppError(
          ErrorCodes.FORBIDDEN,
          `This operation requires scopes: ${scopes.join(', ')}`
        )
      );
    }

    next();
  };
}

/**
 * Get rate limit for the authenticated API key
 * Returns custom rate limit if set, or null for default behavior
 */
export function getApiKeyRateLimit(req: Request): number | null {
  const authReq = req as ApiKeyAuthenticatedRequest;
  return authReq.apiKey?.rateLimit ?? null;
}

/**
 * Check if request was authenticated via API key
 */
export function isApiKeyAuth(req: Request): boolean {
  return !!(req as ApiKeyAuthenticatedRequest).apiKey;
}
