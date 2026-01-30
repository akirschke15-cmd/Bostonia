import Redis from 'ioredis';
import { getEnv } from '@bostonia/shared';

const REDIS_URL = getEnv('REDIS_URL', 'redis://localhost:6379');

export const redis = new Redis(REDIS_URL);

export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

export async function getRedis(): Promise<Redis> {
  return redis;
}
