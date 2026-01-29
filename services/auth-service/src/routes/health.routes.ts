import { Router, type Request, type Response } from 'express';
import { prisma } from '@bostonia/database';
import { successResponse } from '@bostonia/shared';

export const healthRouter: Router = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  res.json(successResponse({
    status: 'healthy',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
  }));
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json(successResponse({
      status: 'ready',
      service: 'auth-service',
      checks: {
        database: 'connected',
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
