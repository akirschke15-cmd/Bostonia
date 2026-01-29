import { Router, type Request, type Response } from 'express';
import { prisma } from '@bostonia/database';
import { successResponse } from '@bostonia/shared';
import { isStripeConfigured } from '../lib/stripe.js';

export const healthRouter: Router = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  res.json(successResponse({
    status: 'healthy',
    service: 'payment-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }));
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json(successResponse({
      status: 'ready',
      service: 'payment-service',
      checks: {
        database: 'connected',
        stripe: isStripeConfigured() ? 'configured' : 'not_configured',
      },
    }));
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service not ready',
      },
    });
  }
});
