/**
 * Advanced Adaptive Rate Limiter
 *
 * Implements:
 * - Trust-score based adaptive limits
 * - Endpoint sensitivity tiers
 * - Sliding window + token bucket hybrid
 * - Distributed rate limiting
 * - Burst protection
 */

import type { Redis } from 'ioredis';
import type {
  AdaptiveRateLimit,
  RateLimitConfig,
  EndpointSensitivity,
  TrustTier,
  ENDPOINT_LIMITS,
} from '../types/fraud.types.js';

// Default limits by trust tier
const TRUST_TIER_MULTIPLIERS: Record<TrustTier, number> = {
  UNTRUSTED: 0.25,
  LOW: 0.5,
  MEDIUM: 1.0,
  HIGH: 1.5,
  VERIFIED: 2.0,
};

// Endpoint sensitivity configuration
const ENDPOINT_SENSITIVITY_MAP: Record<string, EndpointSensitivity> = {
  // Critical endpoints (revenue affecting)
  '/api/payments/*': 'CRITICAL',
  '/api/checkout/*': 'CRITICAL',
  '/api/subscription/*': 'CRITICAL',

  // High sensitivity (authentication, account)
  '/api/auth/login': 'HIGH',
  '/api/auth/register': 'HIGH',
  '/api/auth/password-reset': 'HIGH',
  '/api/users/*/credits': 'HIGH',

  // Medium sensitivity (content creation)
  '/api/conversations/*/messages': 'MEDIUM',
  '/api/characters': 'MEDIUM',

  // Low sensitivity (read operations)
  '/api/characters/*': 'LOW',
  '/api/conversations': 'LOW',
  '/health': 'LOW',
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
  retryAfter: number | null;
  reason: string | null;
}

export interface RateLimitContext {
  userId: string | null;
  ipAddress: string;
  endpoint: string;
  trustTier: TrustTier;
  deviceId: string | null;
}

export class AdaptiveRateLimiterService {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix = 'bostonia:ratelimit') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // MAIN RATE LIMITING
  // ===========================================================================

  /**
   * Check if request should be allowed based on adaptive rate limits
   */
  async checkRateLimit(context: RateLimitContext): Promise<RateLimitResult> {
    const sensitivity = this.getEndpointSensitivity(context.endpoint);
    const baseLimit = this.getBaseLimit(sensitivity);
    const multiplier = TRUST_TIER_MULTIPLIERS[context.trustTier];

    const effectiveLimit: RateLimitConfig = {
      requestsPerSecond: Math.ceil(baseLimit.requestsPerSecond * multiplier),
      requestsPerMinute: Math.ceil(baseLimit.requestsPerMinute * multiplier),
      requestsPerHour: Math.ceil(baseLimit.requestsPerHour * multiplier),
      burstLimit: Math.ceil(baseLimit.burstLimit * multiplier),
      cooldownSeconds: baseLimit.cooldownSeconds,
    };

    // Check all windows
    const identifier = context.userId || context.ipAddress;
    const [secondResult, minuteResult, hourResult, burstResult] = await Promise.all([
      this.checkWindow(identifier, 'second', 1, effectiveLimit.requestsPerSecond),
      this.checkWindow(identifier, 'minute', 60, effectiveLimit.requestsPerMinute),
      this.checkWindow(identifier, 'hour', 3600, effectiveLimit.requestsPerHour),
      this.checkBurst(identifier, effectiveLimit.burstLimit),
    ]);

    // Return most restrictive result
    if (!burstResult.allowed) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: burstResult.resetAt,
        limit: effectiveLimit.burstLimit,
        retryAfter: Math.ceil((burstResult.resetAt.getTime() - Date.now()) / 1000),
        reason: 'Burst limit exceeded',
      };
    }

    if (!secondResult.allowed) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: secondResult.resetAt,
        limit: effectiveLimit.requestsPerSecond,
        retryAfter: Math.ceil((secondResult.resetAt.getTime() - Date.now()) / 1000),
        reason: 'Per-second rate limit exceeded',
      };
    }

    if (!minuteResult.allowed) {
      return {
        allowed: false,
        remaining: minuteResult.remaining,
        resetAt: minuteResult.resetAt,
        limit: effectiveLimit.requestsPerMinute,
        retryAfter: Math.ceil((minuteResult.resetAt.getTime() - Date.now()) / 1000),
        reason: 'Per-minute rate limit exceeded',
      };
    }

    if (!hourResult.allowed) {
      return {
        allowed: false,
        remaining: hourResult.remaining,
        resetAt: hourResult.resetAt,
        limit: effectiveLimit.requestsPerHour,
        retryAfter: Math.ceil((hourResult.resetAt.getTime() - Date.now()) / 1000),
        reason: 'Hourly rate limit exceeded',
      };
    }

    // Find most restrictive remaining
    const mostRestrictive = [secondResult, minuteResult, hourResult].reduce((a, b) =>
      a.remaining / a.limit < b.remaining / b.limit ? a : b
    );

    return {
      allowed: true,
      remaining: mostRestrictive.remaining,
      resetAt: mostRestrictive.resetAt,
      limit: mostRestrictive.limit,
      retryAfter: null,
      reason: null,
    };
  }

  /**
   * Sliding window rate limit check
   */
  private async checkWindow(
    identifier: string,
    window: string,
    windowSeconds: number,
    limit: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date; limit: number }> {
    const key = `${this.keyPrefix}:${window}:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Lua script for atomic sliding window operation
    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

      -- Count current requests
      local count = redis.call('ZCARD', key)

      if count >= limit then
        -- Get oldest entry to calculate reset time
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset_at = oldest[2] and (tonumber(oldest[2]) + window_ms) or (now + window_ms)
        return {0, limit - count, reset_at}
      end

      -- Add current request
      redis.call('ZADD', key, now, now .. '-' .. math.random())
      redis.call('PEXPIRE', key, window_ms + 1000)

      return {1, limit - count - 1, now + window_ms}
    `;

    const result = (await this.redis.eval(
      script,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      limit.toString(),
      windowMs.toString()
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: Math.max(0, result[1]),
      resetAt: new Date(result[2]),
      limit,
    };
  }

  /**
   * Token bucket burst protection
   */
  private async checkBurst(
    identifier: string,
    burstLimit: number
  ): Promise<{ allowed: boolean; resetAt: Date }> {
    const key = `${this.keyPrefix}:burst:${identifier}`;
    const now = Date.now();

    // Simple sliding window for burst (100ms window)
    const windowMs = 100;
    const windowStart = now - windowMs;

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      local count = redis.call('ZCARD', key)

      if count >= limit then
        return {0, now + 100}
      end

      redis.call('ZADD', key, now, now .. '-' .. math.random())
      redis.call('PEXPIRE', key, 200)

      return {1, now + 100}
    `;

    const result = (await this.redis.eval(
      script,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      burstLimit.toString()
    )) as [number, number];

    return {
      allowed: result[0] === 1,
      resetAt: new Date(result[1]),
    };
  }

  // ===========================================================================
  // ENDPOINT-SPECIFIC LIMITS
  // ===========================================================================

  /**
   * Check rate limit for a specific operation (more granular than endpoint)
   */
  async checkOperationLimit(
    identifier: string,
    operation: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:op:${operation}:${identifier}`;
    const result = await this.checkWindow(identifier, `op:${operation}`, windowSeconds, maxRequests);

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: result.resetAt,
      limit: maxRequests,
      retryAfter: result.allowed ? null : Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      reason: result.allowed ? null : `Operation limit exceeded for ${operation}`,
    };
  }

  /**
   * Apply temporary rate limit penalty
   */
  async applyPenalty(
    identifier: string,
    multiplier: number,
    durationSeconds: number,
    reason: string
  ): Promise<void> {
    const key = `${this.keyPrefix}:penalty:${identifier}`;
    const penalty = {
      multiplier,
      reason,
      appliedAt: Date.now(),
      expiresAt: Date.now() + durationSeconds * 1000,
    };

    await this.redis.setex(key, durationSeconds, JSON.stringify(penalty));
  }

  /**
   * Get active penalty for identifier
   */
  async getPenalty(
    identifier: string
  ): Promise<{ multiplier: number; reason: string } | null> {
    const key = `${this.keyPrefix}:penalty:${identifier}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const penalty = JSON.parse(data);
      return { multiplier: penalty.multiplier, reason: penalty.reason };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // DISTRIBUTED RATE LIMITING
  // ===========================================================================

  /**
   * Global rate limit across all instances (for critical operations)
   */
  async checkGlobalLimit(
    operation: string,
    maxRequestsPerSecond: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `${this.keyPrefix}:global:${operation}`;
    const now = Date.now();
    const windowMs = 1000;
    const windowStart = now - windowMs;

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      local count = redis.call('ZCARD', key)

      if count >= limit then
        return {0, 0}
      end

      redis.call('ZADD', key, now, now .. '-' .. math.random())
      redis.call('PEXPIRE', key, 2000)

      return {1, limit - count - 1}
    `;

    const result = (await this.redis.eval(
      script,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      maxRequestsPerSecond.toString()
    )) as [number, number];

    return {
      allowed: result[0] === 1,
      remaining: Math.max(0, result[1]),
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getEndpointSensitivity(endpoint: string): EndpointSensitivity {
    // Check exact match first
    if (ENDPOINT_SENSITIVITY_MAP[endpoint]) {
      return ENDPOINT_SENSITIVITY_MAP[endpoint];
    }

    // Check wildcard patterns
    for (const [pattern, sensitivity] of Object.entries(ENDPOINT_SENSITIVITY_MAP)) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(endpoint)) {
          return sensitivity;
        }
      }
    }

    return 'MEDIUM'; // Default
  }

  private getBaseLimit(sensitivity: EndpointSensitivity): RateLimitConfig {
    const limits: Record<EndpointSensitivity, RateLimitConfig> = {
      LOW: {
        requestsPerSecond: 10,
        requestsPerMinute: 300,
        requestsPerHour: 5000,
        burstLimit: 20,
        cooldownSeconds: 1,
      },
      MEDIUM: {
        requestsPerSecond: 5,
        requestsPerMinute: 100,
        requestsPerHour: 2000,
        burstLimit: 10,
        cooldownSeconds: 2,
      },
      HIGH: {
        requestsPerSecond: 2,
        requestsPerMinute: 30,
        requestsPerHour: 500,
        burstLimit: 5,
        cooldownSeconds: 5,
      },
      CRITICAL: {
        requestsPerSecond: 0.5,
        requestsPerMinute: 10,
        requestsPerHour: 100,
        burstLimit: 2,
        cooldownSeconds: 10,
      },
    };

    return limits[sensitivity];
  }

  /**
   * Get rate limit headers for response
   */
  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetAt.getTime() / 1000).toString(),
    };

    if (result.retryAfter !== null) {
      headers['Retry-After'] = result.retryAfter.toString();
    }

    return headers;
  }
}
