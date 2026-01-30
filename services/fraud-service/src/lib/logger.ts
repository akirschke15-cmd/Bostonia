import pino from 'pino';
import { getEnv } from '@bostonia/shared';

export const logger = pino({
  level: getEnv('LOG_LEVEL', 'info'),
  transport:
    getEnv('NODE_ENV', 'development') === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        }
      : undefined,
});
