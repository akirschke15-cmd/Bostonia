import pino from 'pino';
import { getEnv } from '@bostonia/shared';

export const logger = pino({
  level: getEnv('LOG_LEVEL', 'info'),
  transport: process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }
    : undefined,
});
