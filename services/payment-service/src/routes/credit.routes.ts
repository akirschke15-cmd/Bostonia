import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, ErrorCodes, calculatePagination } from '@bostonia/shared';
import { authenticate, internalServiceAuth, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requireStripe } from '../middleware/stripe.middleware.js';
import { AppError } from '../middleware/error-handler.js';
import { creditService } from '../services/credit.service.js';

export const creditRouter: Router = Router();

// Validation schemas
const purchaseCreditsSchema = z.object({
  packageId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['purchase', 'usage', 'refund', 'bonus', 'subscription']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const deductCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().min(1),
  referenceType: z.enum(['character', 'message', 'feature']).optional(),
  referenceId: z.string().optional(),
  idempotencyKey: z.string().min(1),
});

// GET /credits/balance - Get credit balance
creditRouter.get('/balance',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const balance = await creditService.getBalance(userId);

      res.json(successResponse({
        balance: balance.balance,
        lifetimePurchased: balance.lifetimePurchased,
        lifetimeUsed: balance.lifetimeUsed,
        lifetimeEarned: balance.lifetimeEarned,
        lastPurchaseAt: balance.lastPurchaseAt?.toISOString() || null,
        lastUsageAt: balance.lastUsageAt?.toISOString() || null,
      }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /credits/packages - List credit packages
creditRouter.get('/packages',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const packages = creditService.getPackages();
      res.json(successResponse(packages));
    } catch (error) {
      next(error);
    }
  }
);

// POST /credits/purchase - Create checkout session for credit purchase
creditRouter.post('/purchase',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { packageId, successUrl, cancelUrl } = purchaseCreditsSchema.parse(req.body);

      const session = await creditService.purchaseCredits(
        userId,
        packageId,
        successUrl,
        cancelUrl
      );

      res.json(successResponse({
        sessionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt.toISOString(),
      }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /credits/transactions - Get credit transaction history
creditRouter.get('/transactions',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { page, limit, type, startDate, endDate } = transactionsQuerySchema.parse(req.query);

      const { transactions, total } = await creditService.getTransactions(userId, {
        page,
        limit,
        type,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      res.json(successResponse(
        transactions.map(txn => ({
          ...txn,
          createdAt: txn.createdAt.toISOString(),
        })),
        calculatePagination(page, limit, total)
      ));
    } catch (error) {
      next(error);
    }
  }
);

// POST /credits/deduct - Internal endpoint for deducting credits
creditRouter.post('/deduct',
  internalServiceAuth(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, amount, description, referenceType, referenceId, idempotencyKey } =
        deductCreditsSchema.parse(req.body);

      const result = await creditService.deductCredits(
        userId,
        amount,
        description,
        referenceType,
        referenceId,
        idempotencyKey
      );

      res.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  }
);
