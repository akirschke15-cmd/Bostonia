/**
 * Analytics Service - Main Entry Point
 *
 * Behavioral Analytics System for Bostonia
 *
 * This service provides fraud detection capabilities by analyzing:
 * - User behavior patterns (typing, mouse, navigation)
 * - Conversation quality metrics
 * - Network/graph analysis for cluster detection
 * - Statistical fingerprinting
 *
 * Architecture:
 * - Client-side collector sends behavioral events
 * - Real-time processing for immediate suspicious activity
 * - Batch processing for network analysis and scoring updates
 * - Admin API for fraud review dashboard
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import pino from 'pino';

// Load environment variables
config({ path: resolve(__dirname, '../../../.env') });

import { createAnalyticsRouter } from './routes/analytics.routes.js';
import { createAnalyticsPipeline } from './services/analytics-pipeline.service.js';
import { createBatchAnalyzer } from './workers/batch-analyzer.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const PORT = parseInt(process.env.ANALYTICS_PORT || '3007', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// =============================================================================
// DATABASE SETUP (Mock for now - use Prisma in production)
// =============================================================================

// This is a mock database client. In production, import from @bostonia/database
const mockDb: any = {
  behavioralEvent: {
    createMany: async (data: any) => ({ count: data.data.length }),
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
  },
  userTypingProfile: {
    upsert: async (data: any) => data.create,
    findUnique: async () => null,
  },
  sessionProfile: {
    create: async (data: any) => data.data,
    findMany: async () => [],
  },
  userBehavioralFingerprint: {
    upsert: async (data: any) => data.create,
    findUnique: async () => null,
  },
  userFraudScore: {
    upsert: async (data: any) => data.create,
    findUnique: async () => null,
    findMany: async () => [],
    count: async () => 0,
    groupBy: async () => [],
    update: async (data: any) => data,
  },
  suspiciousCluster: {
    create: async (data: any) => data.data,
    findMany: async () => [],
    count: async () => 0,
    deleteMany: async () => ({ count: 0 }),
  },
  collusionRingDetection: {
    create: async (data: any) => data.data,
    findMany: async () => [],
    count: async () => 0,
    deleteMany: async () => ({ count: 0 }),
  },
  userInteractionEdge: {
    findMany: async () => [],
  },
  user: {
    findMany: async () => [],
    update: async (data: any) => data,
  },
  conversation: {
    findMany: async () => [],
  },
  conversationQualityMetric: {
    create: async (data: any) => data.data,
  },
};

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Authentication middleware (simplified - use real auth in production)
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // In production, verify JWT and attach user to request
  (req as any).user = { id: 'test-user', role: 'USER' };
  next();
};

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  // In production, verify JWT and check admin role
  const user = (req as any).user || { id: 'test-admin', role: 'ADMIN' };

  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  (req as any).user = user;
  next();
};

// =============================================================================
// APPLICATION SETUP
// =============================================================================

async function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));

  // Logging
  app.use(pinoHttp({ logger }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        service: 'analytics-service',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Initialize services
  const analyticsPipeline = createAnalyticsPipeline(mockDb, {
    enableRealTimeScoring: true,
    batchSize: 100,
    batchIntervalMs: 30000,
  });

  const batchAnalyzer = createBatchAnalyzer(mockDb, {
    clusterDetectionInterval: 6 * 60 * 60 * 1000,
    scoreUpdateInterval: 1 * 60 * 60 * 1000,
  });

  // Start pipeline and batch analyzer
  analyticsPipeline.start();
  batchAnalyzer.start();

  // Create and mount routes
  const analyticsRouter = createAnalyticsRouter({
    analyticsPipeline,
    db: mockDb,
    requireAuth,
    requireAdmin,
  });

  app.use('/api/analytics', analyticsRouter);

  // Batch analyzer status endpoint
  app.get('/api/analytics/batch-status', requireAdmin, (_req, res) => {
    res.json({
      success: true,
      data: batchAnalyzer.getStatus(),
    });
  });

  // Manual job trigger endpoint
  app.post('/api/analytics/batch-run/:jobName', requireAdmin, async (req, res) => {
    const { jobName } = req.params;
    const result = await batchAnalyzer.runJob(jobName);
    res.json({
      success: result.success,
      data: result,
    });
  });

  // Error handling
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(err, 'Unhandled error');
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down analytics service...');
    analyticsPipeline.stop();
    batchAnalyzer.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return app;
}

// =============================================================================
// START SERVER
// =============================================================================

createApp()
  .then((app) => {
    app.listen(PORT, () => {
      logger.info(`Analytics service listening on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Events endpoint: http://localhost:${PORT}/api/analytics/events`);
      logger.info(`Admin dashboard: http://localhost:${PORT}/api/analytics/admin/dashboard/stats`);
    });
  })
  .catch((error) => {
    logger.error(error, 'Failed to start analytics service');
    process.exit(1);
  });

// =============================================================================
// EXPORTS
// =============================================================================

export { createAnalyticsPipeline } from './services/analytics-pipeline.service.js';
export { fraudScoringService, FraudScoringService } from './services/fraud-scoring.service.js';
export { typingAnalyzer, TypingAnalyzer } from './detectors/typing-analyzer.js';
export { conversationQualityAnalyzer, ConversationQualityAnalyzer } from './detectors/conversation-quality-analyzer.js';
export { networkAnalyzer, NetworkAnalyzer } from './detectors/network-analyzer.js';
export { BehavioralCollector, initCollector, getCollector } from './collectors/client-collector.js';
export * from './models/schemas.js';
