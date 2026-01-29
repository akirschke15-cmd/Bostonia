import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, ErrorCodes, calculatePagination } from '@bostonia/shared';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requireStripe } from '../middleware/stripe.middleware.js';
import { AppError } from '../middleware/error-handler.js';
import { creatorService } from '../services/creator.service.js';

export const creatorRouter: Router = Router();

// Validation schemas
const earningsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const earningsHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  characterId: z.string().optional(),
  type: z.enum(['subscription_share', 'premium_unlock', 'tip']).optional(),
});

const payoutHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
});

const requestPayoutSchema = z.object({
  amount: z.number().int().positive().optional(),
});

const stripeConnectSetupSchema = z.object({
  refreshUrl: z.string().url(),
  returnUrl: z.string().url(),
});

// GET /creator/earnings - Get earnings summary
creatorRouter.get('/earnings',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { startDate, endDate } = earningsQuerySchema.parse(req.query);

      const summary = await creatorService.getEarningsSummary(
        userId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );

      res.json(successResponse(summary));
    } catch (error) {
      next(error);
    }
  }
);

// GET /creator/earnings/history - Get detailed earnings history
creatorRouter.get('/earnings/history',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { page, limit, characterId, type } = earningsHistoryQuerySchema.parse(req.query);

      const { entries, total } = await creatorService.getEarningsHistory(userId, {
        page,
        limit,
        characterId,
        type,
      });

      res.json(successResponse(
        entries.map(entry => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
        calculatePagination(page, limit, total)
      ));
    } catch (error) {
      next(error);
    }
  }
);

// GET /creator/payouts - Get payout history
creatorRouter.get('/payouts',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { page, limit, status } = payoutHistoryQuerySchema.parse(req.query);

      const { payouts, total } = await creatorService.getPayoutHistory(userId, {
        page,
        limit,
        status,
      });

      res.json(successResponse(
        payouts.map(payout => ({
          ...payout,
          requestedAt: payout.requestedAt.toISOString(),
          processedAt: payout.processedAt?.toISOString() || null,
          completedAt: payout.completedAt?.toISOString() || null,
        })),
        calculatePagination(page, limit, total)
      ));
    } catch (error) {
      next(error);
    }
  }
);

// POST /creator/payouts - Request a payout
creatorRouter.post('/payouts',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { amount } = requestPayoutSchema.parse(req.body || {});

      const payout = await creatorService.requestPayout(userId, amount);

      // Calculate estimated arrival (5 business days)
      const estimatedArrival = new Date();
      estimatedArrival.setDate(estimatedArrival.getDate() + 5);

      res.json(successResponse({
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        estimatedArrival: estimatedArrival.toISOString(),
        requestedAt: payout.requestedAt.toISOString(),
      }));
    } catch (error) {
      next(error);
    }
  }
);

// POST /creator/stripe-connect/setup - Setup Stripe Connect
creatorRouter.post('/stripe-connect/setup',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { refreshUrl, returnUrl } = stripeConnectSetupSchema.parse(req.body);

      const result = await creatorService.setupStripeConnect(userId, refreshUrl, returnUrl);

      res.json(successResponse({
        accountLinkUrl: result.accountLinkUrl,
        expiresAt: result.expiresAt.toISOString(),
      }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /creator/stripe-connect/status - Get Stripe Connect status
creatorRouter.get('/stripe-connect/status',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const status = await creatorService.getStripeConnectStatus(userId);

      res.json(successResponse(status));
    } catch (error) {
      next(error);
    }
  }
);
