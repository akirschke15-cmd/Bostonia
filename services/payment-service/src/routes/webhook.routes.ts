import { Router, type Request, type Response, type NextFunction } from 'express';
import { successResponse } from '@bostonia/shared';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { webhookService } from '../services/webhook.service.js';
import { logger } from '../lib/logger.js';

export const webhookRouter: Router = Router();

// POST /webhooks/stripe - Handle Stripe webhook events
// Note: This route uses raw body parsing, configured in app.ts
webhookRouter.post('/stripe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        throw new AppError(ErrorCodes.INVALID_INPUT, 'Missing Stripe signature header');
      }

      // req.body should be raw Buffer due to express.raw() middleware
      const payload = req.body as Buffer;

      // Verify and construct the event
      const event = webhookService.verifyWebhook(payload, signature);

      // Handle the event
      const result = await webhookService.handleEvent(event);

      res.json(successResponse({
        received: true,
        eventType: result.eventType,
        eventId: result.eventId,
      }));
    } catch (error) {
      // Log the error but still return 200 to prevent Stripe from retrying
      // unless it's a signature verification error
      if (error instanceof AppError && error.code === ErrorCodes.INVALID_INPUT) {
        logger.error(error, 'Webhook signature verification failed');
        return res.status(400).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }

      // For other errors, log but return 200 to acknowledge receipt
      logger.error(error, 'Webhook processing error');
      res.json(successResponse({
        received: true,
        error: 'Processing failed but acknowledged',
      }));
    }
  }
);
