import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { rateLimit } from './middleware/rate-limit.middleware.js';
import { healthRouter } from './routes/health.routes.js';
import { subscriptionRouter } from './routes/subscription.routes.js';
import { creditRouter } from './routes/credit.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { creatorRouter } from './routes/creator.routes.js';
import { apiKeyRouter } from './routes/api-key.routes.js';
import { getEnv } from '@bostonia/shared';
import { connectRedis } from './lib/redis.js';

export async function createApp(): Promise<Express> {
  const app = express();

  // Initialize Redis connection for rate limiting
  try {
    await connectRedis();
    logger.info('Redis connected for rate limiting');
  } catch (error) {
    logger.warn({ err: error }, 'Redis connection failed - rate limiting will be disabled');
  }

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: getEnv('FRONTEND_URL', 'http://localhost:3000'),
    credentials: true,
  }));

  // Stripe webhook route needs raw body - must be before express.json()
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

  // Body parsing for all other routes
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging (skip for webhooks to avoid logging raw body)
  app.use(pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url?.startsWith('/webhooks') || false,
    },
  }));

  // Rate limiting middleware
  // Skips health checks and webhooks (which have their own signature validation)
  app.use(rateLimit({
    skipPaths: ['/health', '/webhooks'],
    skipInternalRequests: true,
    checkAllWindows: true,
  }));

  // Routes
  app.use('/health', healthRouter);
  app.use('/subscriptions', subscriptionRouter);
  app.use('/credits', creditRouter);
  app.use('/billing', billingRouter);
  app.use('/webhooks', webhookRouter);
  app.use('/creator', creatorRouter);
  app.use('/api-keys', apiKeyRouter);

  // Error handling
  app.use(errorHandler);

  return app;
}
