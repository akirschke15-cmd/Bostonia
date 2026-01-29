/**
 * Rate Limit Configuration
 *
 * Defines rate limits for each subscription tier and API key defaults.
 * These limits use a sliding window algorithm to track requests.
 */

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

/**
 * Default rate limit for FREE tier
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = { requestsPerMinute: 60, requestsPerHour: 500 };

/**
 * Rate limits by subscription tier
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  FREE: DEFAULT_RATE_LIMIT,
  BASIC: { requestsPerMinute: 300, requestsPerHour: 5000 },
  PREMIUM: { requestsPerMinute: 1000, requestsPerHour: 20000 },
  UNLIMITED: { requestsPerMinute: 5000, requestsPerHour: 100000 },
  API_KEY_DEFAULT: { requestsPerMinute: 500, requestsPerHour: 10000 },
};

/**
 * Subscription tiers enum (matching Prisma schema)
 */
export type RateLimitTier = keyof typeof RATE_LIMITS;

/**
 * Get rate limit config for a given tier
 * Falls back to FREE tier if tier is not found
 */
export function getRateLimitConfig(tier: string): RateLimitConfig {
  const upperTier = tier.toUpperCase();
  return RATE_LIMITS[upperTier] ?? DEFAULT_RATE_LIMIT;
}

/**
 * Rate limit window types
 */
export type RateLimitWindow = 'minute' | 'hour';

/**
 * Get window duration in milliseconds
 */
export function getWindowDurationMs(window: RateLimitWindow): number {
  switch (window) {
    case 'minute':
      return 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    default:
      return 60 * 1000;
  }
}

/**
 * Get the request limit for a window type from config
 */
export function getWindowLimit(config: RateLimitConfig, window: RateLimitWindow): number {
  switch (window) {
    case 'minute':
      return config.requestsPerMinute;
    case 'hour':
      return config.requestsPerHour;
    default:
      return config.requestsPerMinute;
  }
}
