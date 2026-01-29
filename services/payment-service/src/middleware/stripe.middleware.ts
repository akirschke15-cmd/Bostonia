import type { Request, Response, NextFunction } from 'express';
import { isStripeConfigured } from '../lib/stripe.js';
import { errorResponse, ErrorCodes } from '@bostonia/shared';

/**
 * Middleware to check if Stripe is configured
 * Returns 503 if Stripe is not configured (useful for development without Stripe credentials)
 */
export function requireStripe() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isStripeConfigured()) {
      return res.status(503).json(
        errorResponse(
          ErrorCodes.SERVICE_UNAVAILABLE,
          'Payment service not configured - STRIPE_SECRET_KEY not set'
        )
      );
    }
    next();
  };
}
