import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimitResult,
  ErrorCodes,
  errorResponse,
} from '@bostonia/shared';
import { getRedisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

// Singleton rate limiter instance
let rateLimiter: RateLimiter | null = null;

/**
 * Get or create the rate limiter instance
 */
function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    const redis = getRedisClient();
    rateLimiter = createRateLimiter(redis, { keyPrefix: 'bostonia:ratelimit' });
  }
  return rateLimiter;
}

/**
 * Set rate limit response headers
 */
function setRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', result.limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());
  res.setHeader('X-RateLimit-Window', result.window);
}

/**
 * Calculate retry-after value in seconds
 */
function calculateRetryAfter(resetAt: Date): number {
  const now = Date.now();
  const retryAfterMs = resetAt.getTime() - now;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/**
 * Extract client IP from request
 */
function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return forwardedIp?.trim() || req.ip || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return (Array.isArray(realIp) ? realIp[0] : realIp) || 'unknown';
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
  /** Skip rate limiting for certain paths */
  skipPaths?: string[];
  /** Skip rate limiting for internal service requests */
  skipInternalRequests?: boolean;
  /** Custom tier resolver */
  getTier?: (req: Request) => string | Promise<string>;
  /** Whether to check both minute and hour windows (default: true) */
  checkAllWindows?: boolean;
}

/**
 * Create rate limit middleware
 *
 * This middleware checks rate limits based on:
 * 1. Authenticated user's subscription tier (from JWT)
 * 2. API key limits (if using API key auth)
 * 3. IP-based limits for unauthenticated requests
 */
export function rateLimit(options: RateLimitMiddlewareOptions = {}) {
  const {
    skipPaths = ['/health', '/webhooks'],
    skipInternalRequests = true,
    getTier,
    checkAllWindows = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip rate limiting for specified paths
      const requestPath = req.path.toLowerCase();
      if (skipPaths.some((path) => requestPath.startsWith(path.toLowerCase()))) {
        return next();
      }

      // Skip for internal service requests
      if (skipInternalRequests && req.headers['x-internal-service-key']) {
        return next();
      }

      const limiter = getRateLimiter();
      const authReq = req as AuthenticatedRequest;
      let result: RateLimitResult;

      // Determine identifier and tier
      if (authReq.authUser?.userId) {
        // Authenticated user - use their subscription tier
        let tier = 'FREE';

        if (getTier) {
          tier = await getTier(req);
        } else if (authReq.authUser.dbUser) {
          tier = authReq.authUser.dbUser.subscriptionTier || 'FREE';
        }

        if (checkAllWindows) {
          result = await limiter.checkAllWindows(authReq.authUser.userId, 'user', { tier });
        } else {
          result = await limiter.checkUserLimit(authReq.authUser.userId, { tier });
        }
      } else {
        // Unauthenticated request - use IP-based limiting with FREE tier
        const clientIp = getClientIp(req);

        if (checkAllWindows) {
          result = await limiter.checkAllWindows(clientIp, 'ip', { tier: 'FREE' });
        } else {
          result = await limiter.checkIpLimit(clientIp, { tier: 'FREE' });
        }
      }

      // Always set rate limit headers
      setRateLimitHeaders(res, result);

      if (!result.allowed) {
        const retryAfter = calculateRetryAfter(result.resetAt);

        // Set Retry-After header
        res.setHeader('Retry-After', retryAfter.toString());

        logger.warn(
          {
            userId: (req as AuthenticatedRequest).authUser?.userId,
            ip: getClientIp(req),
            path: req.path,
            window: result.window,
            limit: result.limit,
            retryAfter,
          },
          'Rate limit exceeded'
        );

        return res.status(429).json(
          errorResponse(ErrorCodes.RATE_LIMITED, `Rate limit exceeded. Please retry after ${retryAfter} seconds.`, {
            retryAfter,
            limit: result.limit,
            remaining: result.remaining,
            window: result.window,
            resetAt: result.resetAt.toISOString(),
          })
        );
      }

      next();
    } catch (error) {
      // Log error but don't block request if rate limiter fails
      logger.error({ err: error }, 'Rate limiter error - allowing request');
      next();
    }
  };
}

/**
 * Strict rate limit middleware that blocks requests on rate limiter errors
 */
export function strictRateLimit(options: RateLimitMiddlewareOptions = {}) {
  const baseMiddleware = rateLimit(options);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await baseMiddleware(req, res, next);
    } catch (error) {
      logger.error({ err: error }, 'Rate limiter error - blocking request');
      return res.status(503).json(
        errorResponse(ErrorCodes.SERVICE_UNAVAILABLE, 'Rate limiting service unavailable')
      );
    }
  };
}

/**
 * Rate limit middleware for specific operations (e.g., expensive endpoints)
 */
export function operationRateLimit(
  operationKey: string,
  maxRequests: number,
  windowSeconds: number
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redis = getRedisClient();
      const authReq = req as AuthenticatedRequest;

      // Build identifier
      const identifier = authReq.authUser?.userId || getClientIp(req);
      const key = `bostonia:oprate:${operationKey}:${identifier}`;

      const now = Date.now();
      const windowMs = windowSeconds * 1000;
      const windowStart = now - windowMs;

      // Use pipeline for atomic operations
      const pipeline = redis.multi();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now.toString(), `${now}-${Math.random().toString(36).slice(2)}`);
      pipeline.pexpire(key, windowMs + 1000);

      const results = await pipeline.exec();
      const currentCount = (results?.[1]?.[1] as number) || 0;

      // Set headers
      const remaining = Math.max(0, maxRequests - currentCount - 1);
      const resetAt = new Date(now + windowMs);

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt.getTime() / 1000).toString());
      res.setHeader('X-RateLimit-Operation', operationKey);

      if (currentCount >= maxRequests) {
        // Remove the request we just added
        await redis.zremrangebyrank(key, -1, -1);

        const retryAfter = Math.ceil(windowMs / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        logger.warn(
          {
            operation: operationKey,
            identifier,
            limit: maxRequests,
            window: windowSeconds,
          },
          'Operation rate limit exceeded'
        );

        return res.status(429).json(
          errorResponse(
            ErrorCodes.RATE_LIMITED,
            `Rate limit exceeded for this operation. Please retry after ${retryAfter} seconds.`,
            {
              retryAfter,
              limit: maxRequests,
              remaining: 0,
              operation: operationKey,
            }
          )
        );
      }

      next();
    } catch (error) {
      logger.error({ err: error, operation: operationKey }, 'Operation rate limiter error');
      next();
    }
  };
}
