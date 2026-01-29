import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, ErrorCodes, calculatePagination } from '@bostonia/shared';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requireStripe } from '../middleware/stripe.middleware.js';
import { AppError } from '../middleware/error-handler.js';
import { subscriptionService } from '../services/subscription.service.js';

export const subscriptionRouter: Router = Router();

// Validation schemas
const createCheckoutSchema = z.object({
  planId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const updateSubscriptionSchema = z.object({
  newPlanId: z.string().min(1),
  prorationBehavior: z.enum(['create_prorations', 'none', 'always_invoice']).default('create_prorations'),
});

const cancelSubscriptionSchema = z.object({
  reason: z.enum(['too_expensive', 'not_using', 'missing_features', 'switching_service', 'other']).optional(),
  feedback: z.string().max(500).optional(),
  cancelImmediately: z.boolean().default(false),
}).optional();

// GET /subscriptions/current - Get current subscription
subscriptionRouter.get('/current',
  authenticate({ loadUser: true }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const subscription = await subscriptionService.getCurrentSubscription(userId);

      if (!subscription) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'No active subscription found');
      }

      res.json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  }
);

// GET /subscriptions/plans - List available subscription plans
subscriptionRouter.get('/plans',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plans = subscriptionService.getPlans();
      res.json(successResponse(plans));
    } catch (error) {
      next(error);
    }
  }
);

// POST /subscriptions/checkout - Create checkout session for new subscription
subscriptionRouter.post('/checkout',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { planId, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);

      const session = await subscriptionService.createCheckoutSession(
        userId,
        planId,
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

// POST /subscriptions/update - Update subscription (change plan)
subscriptionRouter.post('/update',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { newPlanId, prorationBehavior } = updateSubscriptionSchema.parse(req.body);

      const subscription = await subscriptionService.updateSubscription(
        userId,
        newPlanId,
        prorationBehavior
      );

      res.json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  }
);

// POST /subscriptions/cancel - Cancel subscription
subscriptionRouter.post('/cancel',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const body = cancelSubscriptionSchema.parse(req.body);
      const reason = body?.reason;
      const feedback = body?.feedback;
      const cancelImmediately = body?.cancelImmediately ?? false;

      const subscription = await subscriptionService.cancelSubscription(
        userId,
        reason,
        feedback,
        cancelImmediately
      );

      res.json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  }
);

// POST /subscriptions/resume - Resume cancelled subscription
subscriptionRouter.post('/resume',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const subscription = await subscriptionService.resumeSubscription(userId);

      res.json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  }
);
