import Redis from 'ioredis';
import { getEnv } from '@bostonia/shared';
import { logger } from './logger.js';

let redisClient: Redis | null = null;

/**
 * Get the Redis client instance
 * Creates a new connection if one doesn't exist
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = getEnv('REDIS_URL', 'redis://localhost:6379');

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000); // Exponential backoff
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
    });

    redisClient.on('close', () => {
      logger.info('Redis client connection closed');
    });
  }

  return redisClient;
}

/**
 * Connect to Redis
 */
export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client disconnected');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redisClient?.status === 'ready';
}
