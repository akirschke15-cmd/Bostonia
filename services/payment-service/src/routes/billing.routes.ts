import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { successResponse, ErrorCodes, calculatePagination } from '@bostonia/shared';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { requireStripe } from '../middleware/stripe.middleware.js';
import { AppError } from '../middleware/error-handler.js';
import { billingService } from '../services/billing.service.js';

export const billingRouter: Router = Router();

// Validation schemas
const billingHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional(),
});

const setupPaymentMethodSchema = z.object({
  returnUrl: z.string().url().optional(),
});

// GET /billing/history - Get billing history
billingRouter.get('/history',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { page, limit, status } = billingHistoryQuerySchema.parse(req.query);

      const { invoices, total } = await billingService.getBillingHistory(userId, {
        page,
        limit,
        status,
      });

      res.json(successResponse(
        invoices.map(inv => ({
          id: inv.id,
          stripeInvoiceId: inv.stripeInvoiceId,
          number: inv.number,
          status: inv.status,
          amountDue: inv.amountDue,
          amountPaid: inv.amountPaid,
          currency: inv.currency,
          description: inv.description,
          periodStart: inv.periodStart.toISOString(),
          periodEnd: inv.periodEnd.toISOString(),
          paidAt: inv.paidAt?.toISOString() || null,
          invoicePdfUrl: inv.invoicePdfUrl,
          hostedInvoiceUrl: inv.hostedInvoiceUrl,
          createdAt: inv.createdAt.toISOString(),
        })),
        calculatePagination(page, limit, total)
      ));
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/invoices/:invoiceId - Get specific invoice
billingRouter.get('/invoices/:invoiceId',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const invoiceId = req.params.invoiceId!;

      const invoice = await billingService.getInvoice(userId, invoiceId);

      res.json(successResponse({
        id: invoice.id,
        stripeInvoiceId: invoice.stripeInvoiceId,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        currency: invoice.currency,
        description: invoice.description,
        periodStart: invoice.periodStart.toISOString(),
        periodEnd: invoice.periodEnd.toISOString(),
        paidAt: invoice.paidAt?.toISOString() || null,
        invoicePdfUrl: invoice.invoicePdfUrl,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        createdAt: invoice.createdAt.toISOString(),
      }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /billing/payment-methods - Get payment methods
billingRouter.get('/payment-methods',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const paymentMethods = await billingService.getPaymentMethods(userId);

      res.json(successResponse(
        paymentMethods.map(pm => ({
          id: pm.id,
          type: pm.type,
          card: pm.card,
          isDefault: pm.isDefault,
          createdAt: pm.createdAt.toISOString(),
        }))
      ));
    } catch (error) {
      next(error);
    }
  }
);

// POST /billing/payment-methods/setup - Create setup intent for new payment method
billingRouter.post('/payment-methods/setup',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;

      const { returnUrl } = setupPaymentMethodSchema.parse(req.body || {});

      const setupIntent = await billingService.createSetupIntent(userId, returnUrl);

      res.json(successResponse({
        clientSecret: setupIntent.clientSecret,
        setupIntentId: setupIntent.setupIntentId,
      }));
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /billing/payment-methods/:paymentMethodId - Remove payment method
billingRouter.delete('/payment-methods/:paymentMethodId',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const paymentMethodId = req.params.paymentMethodId!;

      await billingService.removePaymentMethod(userId, paymentMethodId);

      res.json(successResponse({ message: 'Payment method removed successfully' }));
    } catch (error) {
      next(error);
    }
  }
);

// POST /billing/payment-methods/:paymentMethodId/default - Set default payment method
billingRouter.post('/payment-methods/:paymentMethodId/default',
  authenticate({ loadUser: true }),
  requireStripe(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.authUser!.userId;
      const paymentMethodId = req.params.paymentMethodId!;

      await billingService.setDefaultPaymentMethod(userId, paymentMethodId);

      res.json(successResponse({ message: 'Default payment method updated successfully' }));
    } catch (error) {
      next(error);
    }
  }
);
