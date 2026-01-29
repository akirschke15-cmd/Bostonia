/**
 * Rate Limit Types
 *
 * These types are separated to avoid requiring ioredis as a dependency
 * for consumers that only need the type definitions.
 */

import type { RateLimitWindow } from '../config/rate-limits.js';

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
 * Rate limit error response format
 */
export interface RateLimitErrorResponse {
  success: false;
  error: {
    code: 'RATE_LIMITED';
    message: string;
    details: {
      retryAfter: number;
      limit: number;
      remaining: number;
      window?: string;
      resetAt?: string;
      operation?: string;
    };
  };
}

/**
 * Create a rate limit error response
 */
export function createRateLimitErrorResponse(
  retryAfter: number,
  limit: number,
  remaining: number,
  options?: {
    window?: string;
    resetAt?: string;
    operation?: string;
  }
): RateLimitErrorResponse {
  return {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
      details: {
        retryAfter,
        limit,
        remaining,
        ...options,
      },
    },
  };
}
