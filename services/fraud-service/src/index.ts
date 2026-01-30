import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { successResponse, getEnv } from '@bostonia/shared';
import { logger } from './lib/logger.js';
import fraudRoutes from './routes/fraud.routes.js';

const PORT = parseInt(getEnv('PORT', '3006'), 10);

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: getEnv('FRONTEND_URL', 'http://localhost:3000'), credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'healthy', service: 'fraud-service' }));
});

// API routes
app.use('/api/fraud', fraudRoutes);

// Start server
app.listen(PORT, () => {
  logger.info(`Fraud detection service listening on port ${PORT}`);
});

export default app;
