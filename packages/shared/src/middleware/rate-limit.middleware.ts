/**
 * Rate Limit Middleware Template
 *
 * This file provides a template for rate limiting middleware that can be used
 * across different services. Services should import and configure this for their needs.
 *
 * Note: This requires ioredis to be installed in the consuming service.
 */

import type { Redis } from 'ioredis';
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimitResult,
} from '../lib/rate-limiter.js';
import { ErrorCodes, errorResponse } from '../utils/index.js';

// Generic request/response types to work with any web framework
export interface RateLimitRequest {
  path: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  // Optional authenticated user info
  user?: {
    id: string;
    subscriptionTier?: string;
  };
}

export interface RateLimitResponse {
  status: (code: number) => RateLimitResponse;
  setHeader: (name: string, value: string) => RateLimitResponse;
  json: (body: unknown) => void;
}

/**
 * Rate limit middleware options
 */
export interface RateLimitMiddlewareOptions {
  /** Redis client instance */
  redis: Redis;
  /** Key prefix for Redis keys (default: 'ratelimit') */
  keyPrefix?: string;
  /** Skip rate limiting for certain paths */
  skipPaths?: string[];
  /** Skip rate limiting for internal service requests */
  skipInternalRequests?: boolean;
  /** Custom tier resolver */
  getTier?: (req: RateLimitRequest) => string | Promise<string>;
  /** Whether to check both minute and hour windows (default: true) */
  checkAllWindows?: boolean;
  /** Logger instance */
  logger?: {
    warn: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
}

/**
 * Set rate limit response headers
 */
export function setRateLimitHeaders(res: RateLimitResponse, result: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', result.limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt.getTime() / 1000).toString());
  res.setHeader('X-RateLimit-Window', result.window);
}

/**
 * Calculate retry-after value in seconds
 */
export function calculateRetryAfter(resetAt: Date): number {
  const now = Date.now();
  const retryAfterMs = resetAt.getTime() - now;
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/**
 * Extract client IP from request
 */
export function getClientIp(req: RateLimitRequest): string {
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

  return req.ip || 'unknown';
}

/**
 * Create a rate limit handler function
 *
 * This returns an async function that can be used in middleware chains.
 * The function returns true if the request should continue, false if rate limited.
 */
export function createRateLimitHandler(options: RateLimitMiddlewareOptions) {
  const {
    redis,
    keyPrefix = 'ratelimit',
    skipPaths = ['/health'],
    skipInternalRequests = true,
    getTier,
    checkAllWindows = true,
    logger,
  } = options;

  const limiter = createRateLimiter(redis, { keyPrefix });

  return async function handleRateLimit(
    req: RateLimitRequest,
    res: RateLimitResponse
  ): Promise<boolean> {
    try {
      // Skip rate limiting for specified paths
      const requestPath = req.path.toLowerCase();
      if (skipPaths.some((path) => requestPath.startsWith(path.toLowerCase()))) {
        return true;
      }

      // Skip for internal service requests
      if (skipInternalRequests && req.headers['x-internal-service-key']) {
        return true;
      }

      let result: RateLimitResult;

      // Determine identifier and tier
      if (req.user?.id) {
        // Authenticated user - use their subscription tier
        let tier = req.user.subscriptionTier || 'FREE';

        if (getTier) {
          tier = await getTier(req);
        }

        if (checkAllWindows) {
          result = await limiter.checkAllWindows(req.user.id, 'user', { tier });
        } else {
          result = await limiter.checkUserLimit(req.user.id, { tier });
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

        logger?.warn(
          {
            userId: req.user?.id,
            ip: getClientIp(req),
            path: req.path,
            window: result.window,
            limit: result.limit,
            retryAfter,
          },
          'Rate limit exceeded'
        );

        res.status(429).json(
          errorResponse(ErrorCodes.RATE_LIMITED, `Rate limit exceeded. Please retry after ${retryAfter} seconds.`, {
            retryAfter,
            limit: result.limit,
            remaining: result.remaining,
            window: result.window,
            resetAt: result.resetAt.toISOString(),
          })
        );

        return false;
      }

      return true;
    } catch (error) {
      // Log error but don't block request if rate limiter fails
      logger?.error({ err: error }, 'Rate limiter error - allowing request');
      return true;
    }
  };
}

/**
 * Express-compatible rate limit middleware factory
 *
 * Usage:
 * ```typescript
 * import { createExpressRateLimitMiddleware } from '@bostonia/shared';
 * import Redis from 'ioredis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * app.use(createExpressRateLimitMiddleware({
 *   redis,
 *   skipPaths: ['/health', '/webhooks'],
 * }));
 * ```
 */
export function createExpressRateLimitMiddleware(options: RateLimitMiddlewareOptions) {
  const handler = createRateLimitHandler(options);

  // Return Express-compatible middleware
  return async (req: any, res: any, next: any) => {
    const rateLimitReq: RateLimitRequest = {
      path: req.path,
      ip: req.ip || req.socket?.remoteAddress,
      headers: req.headers,
      user: req.authUser
        ? {
            id: req.authUser.userId,
            subscriptionTier: req.authUser.dbUser?.subscriptionTier,
          }
        : undefined,
    };

    const allowed = await handler(rateLimitReq, res);

    if (allowed) {
      next();
    }
    // If not allowed, the handler already sent the response
  };
}
