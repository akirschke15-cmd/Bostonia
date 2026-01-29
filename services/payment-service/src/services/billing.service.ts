import { prisma } from '@bostonia/database';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { subscriptionService } from './subscription.service.js';

export interface Invoice {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  description: string | null;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: Date;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  isDefault: boolean;
  createdAt: Date;
}

export class BillingService {
  /**
   * Get billing history (invoices) for a user
   */
  async getBillingHistory(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
    } = {}
  ): Promise<{ invoices: Invoice[]; total: number }> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const { page = 1, limit = 20, status } = options;

    // Get the Stripe customer ID for this user
    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) {
      return { invoices: [], total: 0 };
    }

    try {
      // Fetch invoices from Stripe
      const invoices = await stripe.invoices.list({
        customer: customerId,
        limit: 100, // Fetch more to filter
        status: status as any,
      });

      const filteredInvoices = invoices.data;
      const total = filteredInvoices.length;
      const start = (page - 1) * limit;
      const paginatedInvoices = filteredInvoices.slice(start, start + limit);

      return {
        invoices: paginatedInvoices.map(inv => ({
          id: inv.id,
          stripeInvoiceId: inv.id,
          number: inv.number,
          status: inv.status || 'unknown',
          amountDue: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          description: inv.description,
          periodStart: new Date(inv.period_start * 1000),
          periodEnd: new Date(inv.period_end * 1000),
          paidAt: inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000)
            : null,
          invoicePdfUrl: inv.invoice_pdf ?? null,
          hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
          createdAt: new Date(inv.created * 1000),
        })),
        total,
      };
    } catch (error) {
      logger.error(error, 'Error fetching billing history from Stripe');
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch billing history');
    }
  }

  /**
   * Get a specific invoice
   */
  async getInvoice(userId: string, invoiceId: string): Promise<Invoice> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Invoice not found');
    }

    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);

      // Verify the invoice belongs to this customer
      if (invoice.customer !== customerId) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Invoice not found');
      }

      return {
        id: invoice.id,
        stripeInvoiceId: invoice.id,
        number: invoice.number,
        status: invoice.status || 'unknown',
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        description: invoice.description,
        periodStart: new Date(invoice.period_start * 1000),
        periodEnd: new Date(invoice.period_end * 1000),
        paidAt: invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
        createdAt: new Date(invoice.created * 1000),
      };
    } catch (error: any) {
      if (error.code === ErrorCodes.NOT_FOUND) throw error;
      logger.error(error, 'Error fetching invoice from Stripe');
      throw new AppError(ErrorCodes.NOT_FOUND, 'Invoice not found');
    }
  }

  /**
   * Get payment methods for a user
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) {
      return [];
    }

    try {
      const [paymentMethods, customer] = await Promise.all([
        stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
        }),
        stripe.customers.retrieve(customerId),
      ]);

      const defaultPaymentMethodId =
        (customer as any).invoice_settings?.default_payment_method ||
        (customer as any).default_source;

      return paymentMethods.data.map(pm => ({
        id: pm.id,
        type: 'card' as const,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4!,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        } : undefined,
        isDefault: pm.id === defaultPaymentMethodId,
        createdAt: new Date(pm.created * 1000),
      }));
    } catch (error) {
      logger.error(error, 'Error fetching payment methods from Stripe');
      throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch payment methods');
    }
  }

  /**
   * Create a SetupIntent for adding a new payment method
   */
  async createSetupIntent(userId: string, returnUrl?: string): Promise<{
    clientSecret: string;
    setupIntentId: string;
  }> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const customerId = await subscriptionService.getOrCreateStripeCustomer(userId);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: { userId },
    });

    logger.info({ userId, setupIntentId: setupIntent.id }, 'Setup intent created');

    return {
      clientSecret: setupIntent.client_secret!,
      setupIntentId: setupIntent.id,
    };
  }

  /**
   * Remove a payment method
   */
  async removePaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
    }

    try {
      // Verify the payment method belongs to this customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== customerId) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
      }

      // Check if this is the default payment method and user has active subscription
      const customer = await stripe.customers.retrieve(customerId) as any;
      const defaultPmId = customer.invoice_settings?.default_payment_method;

      if (paymentMethodId === defaultPmId) {
        // Check for active subscription
        const subscription = await prisma.subscription.findFirst({
          where: { userId, status: 'ACTIVE' },
        });

        if (subscription) {
          throw new AppError(
            ErrorCodes.INVALID_INPUT,
            'Cannot remove the default payment method while you have an active subscription. Please add another payment method first.'
          );
        }
      }

      // Detach the payment method
      await stripe.paymentMethods.detach(paymentMethodId);

      logger.info({ userId, paymentMethodId }, 'Payment method removed');
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(error, 'Error removing payment method');
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
    }
  }

  /**
   * Set a payment method as default
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
    }

    try {
      // Verify the payment method belongs to this customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== customerId) {
        throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
      }

      // Set as default
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      logger.info({ userId, paymentMethodId }, 'Default payment method updated');
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(error, 'Error setting default payment method');
      throw new AppError(ErrorCodes.NOT_FOUND, 'Payment method not found');
    }
  }

  /**
   * Get Stripe customer ID for a user
   */
  private async getStripeCustomerId(userId: string): Promise<string | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return subscription?.stripeCustomerId || null;
  }
}

export const billingService = new BillingService();
