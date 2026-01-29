/**
 * Redis-based Rate Limiter using Sliding Window Algorithm
 *
 * This implementation uses Redis sorted sets to track requests within a sliding window.
 * Each request is stored with its timestamp as the score, allowing efficient cleanup
 * of expired entries and accurate request counting.
 */

import type { Redis } from 'ioredis';
import {
  type RateLimitConfig,
  type RateLimitWindow,
  getWindowDurationMs,
  getWindowLimit,
  getRateLimitConfig,
} from '../config/rate-limits.js';

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** When the rate limit window resets */
  resetAt: Date;
  /** The total limit for the current window */
  limit: number;
  /** The window type that was checked */
  window: RateLimitWindow;
}

/**
 * Options for rate limit check
 */
export interface RateLimitOptions {
  /** The subscription tier to use for limits */
  tier?: string;
  /** Custom rate limit config (overrides tier) */
  config?: RateLimitConfig;
  /** Which window to check (defaults to 'minute') */
  window?: RateLimitWindow;
  /** Key prefix for Redis keys */
  keyPrefix?: string;
}

/**
 * Rate limiter class using Redis sliding window algorithm
 */
export class RateLimiter {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, options: { keyPrefix?: string } = {}) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'ratelimit';
  }

  /**
   * Check and consume a rate limit for a user
   * @param userId The user ID to check
   * @param options Rate limit options
   * @returns Rate limit result
   */
  async checkUserLimit(userId: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
    const key = this.buildKey('user', userId, options.window || 'minute');
    return this.checkLimit(key, options);
  }

  /**
   * Check and consume a rate limit for an API key
   * @param apiKeyId The API key ID to check
   * @param options Rate limit options
   * @returns Rate limit result
   */
  async checkApiKeyLimit(apiKeyId: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
    const effectiveOptions = {
      ...options,
      tier: options.tier || 'API_KEY_DEFAULT',
    };
    const key = this.buildKey('apikey', apiKeyId, effectiveOptions.window || 'minute');
    return this.checkLimit(key, effectiveOptions);
  }

  /**
   * Check and consume a rate limit for an IP address (for unauthenticated requests)
   * @param ipAddress The IP address to check
   * @param options Rate limit options
   * @returns Rate limit result
   */
  async checkIpLimit(ipAddress: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
    const effectiveOptions = {
      ...options,
      tier: options.tier || 'FREE',
    };
    const key = this.buildKey('ip', ipAddress, effectiveOptions.window || 'minute');
    return this.checkLimit(key, effectiveOptions);
  }

  /**
   * Check rate limits for both minute and hour windows
   * Returns the most restrictive result
   */
  async checkAllWindows(
    identifier: string,
    identifierType: 'user' | 'apikey' | 'ip',
    options: Omit<RateLimitOptions, 'window'> = {}
  ): Promise<RateLimitResult> {
    const checkMethod = identifierType === 'user'
      ? this.checkUserLimit.bind(this)
      : identifierType === 'apikey'
        ? this.checkApiKeyLimit.bind(this)
        : this.checkIpLimit.bind(this);

    const [minuteResult, hourResult] = await Promise.all([
      checkMethod(identifier, { ...options, window: 'minute' }),
      checkMethod(identifier, { ...options, window: 'hour' }),
    ]);

    // Return the most restrictive result
    if (!minuteResult.allowed) {
      return minuteResult;
    }
    if (!hourResult.allowed) {
      return hourResult;
    }

    // Both allowed, return the one with fewer remaining
    const minutePercentRemaining = minuteResult.remaining / minuteResult.limit;
    const hourPercentRemaining = hourResult.remaining / hourResult.limit;

    return minutePercentRemaining <= hourPercentRemaining ? minuteResult : hourResult;
  }

  /**
   * Get current usage without consuming a request
   */
  async getCurrentUsage(
    identifier: string,
    identifierType: 'user' | 'apikey' | 'ip',
    options: RateLimitOptions = {}
  ): Promise<{ minute: number; hour: number }> {
    const window = options.window || 'minute';
    const now = Date.now();

    const minuteKey = this.buildKey(identifierType, identifier, 'minute');
    const hourKey = this.buildKey(identifierType, identifier, 'hour');

    const minuteWindowStart = now - getWindowDurationMs('minute');
    const hourWindowStart = now - getWindowDurationMs('hour');

    const [minuteCount, hourCount] = await Promise.all([
      this.redis.zcount(minuteKey, minuteWindowStart, now),
      this.redis.zcount(hourKey, hourWindowStart, now),
    ]);

    return {
      minute: minuteCount,
      hour: hourCount,
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetLimit(
    identifier: string,
    identifierType: 'user' | 'apikey' | 'ip',
    window?: RateLimitWindow
  ): Promise<void> {
    if (window) {
      const key = this.buildKey(identifierType, identifier, window);
      await this.redis.del(key);
    } else {
      const minuteKey = this.buildKey(identifierType, identifier, 'minute');
      const hourKey = this.buildKey(identifierType, identifier, 'hour');
      await this.redis.del(minuteKey, hourKey);
    }
  }

  /**
   * Build a Redis key for rate limiting
   */
  private buildKey(type: string, identifier: string, window: RateLimitWindow): string {
    return `${this.keyPrefix}:${type}:${identifier}:${window}`;
  }

  /**
   * Core rate limit check using sliding window algorithm
   */
  private async checkLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const window = options.window || 'minute';
    const config = options.config || getRateLimitConfig(options.tier || 'FREE');
    const limit = getWindowLimit(config, window);
    const windowMs = getWindowDurationMs(window);

    const now = Date.now();
    const windowStart = now - windowMs;

    // Use Redis MULTI/EXEC for atomic operations
    const pipeline = this.redis.multi();

    // Remove expired entries (entries older than the window)
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count current requests in window
    pipeline.zcard(key);

    // Add current request with timestamp as score
    // We add first, then check - this ensures atomicity
    pipeline.zadd(key, now.toString(), `${now}-${Math.random().toString(36).slice(2)}`);

    // Set expiry on the key (slightly longer than window to handle edge cases)
    pipeline.pexpire(key, windowMs + 1000);

    const results = await pipeline.exec();

    if (!results) {
      // If pipeline fails, be conservative and allow the request
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(now + windowMs),
        limit,
        window,
      };
    }

    // Results: [zremrangebyscore, zcard, zadd, pexpire]
    // zcard result is at index 1, and gives count BEFORE we added current request
    const currentCount = (results[1]?.[1] as number) || 0;

    // If current count is already at or above limit, remove the request we just added
    // and deny the request
    if (currentCount >= limit) {
      // Remove the request we just added (it's the one with the highest score)
      await this.redis.zremrangebyrank(key, -1, -1);

      // Calculate when the oldest request in the window will expire
      const oldestRequest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      let resetAt = new Date(now + windowMs);

      if (oldestRequest.length >= 2 && oldestRequest[1]) {
        const oldestTimestamp = parseInt(oldestRequest[1], 10);
        resetAt = new Date(oldestTimestamp + windowMs);
      }

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
        window,
      };
    }

    // Request is allowed
    const remaining = Math.max(0, limit - currentCount - 1);
    const resetAt = new Date(now + windowMs);

    return {
      allowed: true,
      remaining,
      resetAt,
      limit,
      window,
    };
  }
}

/**
 * Create a new rate limiter instance
 */
export function createRateLimiter(redis: Redis, options?: { keyPrefix?: string }): RateLimiter {
  return new RateLimiter(redis, options);
}
