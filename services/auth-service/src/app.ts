import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import passport from 'passport';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { configurePassport } from './lib/passport.js';
import { getEnv } from '@bostonia/shared';

export async function createApp(): Promise<Express> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: getEnv('FRONTEND_URL', 'http://localhost:3000'),
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Logging
  app.use(pinoHttp({ logger }));

  // Passport
  configurePassport();
  app.use(passport.initialize());

  // Routes
  app.use('/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Error handling
  app.use(errorHandler);

  return app;
}
