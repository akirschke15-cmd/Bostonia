import Stripe from 'stripe';
import { prisma } from '@bostonia/database';
import { stripe, getStripeWebhookSecret } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { creditService } from './credit.service.js';
import { SUBSCRIPTION_PLANS, mapApiTierToPrismaTier, getCreditPackageById } from '../config/plans.js';

export class WebhookService {
  /**
   * Verify and construct a Stripe event from the webhook payload
   */
  verifyWebhook(payload: Buffer, signature: string): Stripe.Event {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const webhookSecret = getStripeWebhookSecret();
    if (!webhookSecret) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Webhook secret not configured');
    }

    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      logger.error(err, 'Webhook signature verification failed');
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid Stripe webhook signature');
    }
  }

  /**
   * Handle a Stripe webhook event
   */
  async handleEvent(event: Stripe.Event): Promise<{ eventType: string; eventId: string }> {
    logger.info({ eventType: event.type, eventId: event.id }, 'Processing webhook event');

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.created':
        await this.handleCustomerCreated(event.data.object as Stripe.Customer);
        break;

      case 'payment_method.attached':
        await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;

      default:
        logger.debug({ eventType: event.type }, 'Unhandled webhook event type');
    }

    return { eventType: event.type, eventId: event.id };
  }

  /**
   * Handle checkout.session.completed event
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    const { userId, type, credits, packageId, planId, tier } = session.metadata || {};

    if (type === 'credit_purchase' && credits && userId) {
      // Credit purchase completed
      const creditAmount = parseInt(credits, 10);
      const pkg = packageId ? getCreditPackageById(packageId) : null;
      const description = pkg
        ? `Purchased ${pkg.credits} credits${pkg.bonus > 0 ? ` + ${pkg.bonus} bonus` : ''}`
        : `Purchased ${creditAmount} credits`;

      await creditService.addCredits(userId, creditAmount, 'PURCHASE', description, session.id);

      logger.info({ userId, credits: creditAmount, sessionId: session.id }, 'Credit purchase completed');
    } else if (planId && userId) {
      // Subscription checkout completed - subscription will be handled by subscription.created event
      logger.info({ userId, planId, sessionId: session.id }, 'Subscription checkout completed');
    }
  }

  /**
   * Handle subscription created/updated event
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;

    // Find user by Stripe customer ID or metadata
    let userId = subscription.metadata?.userId;

    if (!userId) {
      const existingSub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      });
      userId = existingSub?.userId;
    }

    if (!userId) {
      logger.warn({ customerId, subscriptionId: subscription.id }, 'Could not find user for subscription');
      return;
    }

    // Determine tier from price ID
    const priceId = subscription.items.data[0]?.price.id;
    const plan = SUBSCRIPTION_PLANS.find(p => p.stripePriceId === priceId);
    const tier = plan?.tier || 'plus';
    const prismaTier = mapApiTierToPrismaTier(tier);

    // Map Stripe status to our status
    const statusMap: Record<string, 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'TRIALING'> = {
      'active': 'ACTIVE',
      'past_due': 'PAST_DUE',
      'canceled': 'CANCELED',
      'incomplete': 'INCOMPLETE',
      'incomplete_expired': 'CANCELED',
      'trialing': 'TRIALING',
      'unpaid': 'PAST_DUE',
    };

    const status = statusMap[subscription.status] || 'ACTIVE';

    // Upsert subscription
    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      update: {
        status,
        tier: prismaTier,
        stripePriceId: priceId || '',
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      create: {
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId || '',
        tier: prismaTier,
        status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });

    // Update user subscription tier
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: prismaTier,
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
      },
    });

    logger.info({ userId, tier, status, subscriptionId: subscription.id }, 'Subscription updated');
  }

  /**
   * Handle subscription deleted event
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const sub = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!sub) {
      logger.warn({ subscriptionId: subscription.id }, 'Subscription not found for deletion');
      return;
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    // Reset user to free tier
    await prisma.user.update({
      where: { id: sub.userId },
      data: {
        subscriptionTier: 'FREE',
        subscriptionExpiresAt: null,
      },
    });

    logger.info({ userId: sub.userId, subscriptionId: subscription.id }, 'Subscription deleted');
  }

  /**
   * Handle invoice.paid event
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    // If this is a subscription invoice, check if we need to add monthly credits
    if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription as string },
      });

      if (sub) {
        // Add monthly credits based on tier
        const plan = SUBSCRIPTION_PLANS.find(p =>
          mapApiTierToPrismaTier(p.tier) === sub.tier
        );

        if (plan && plan.features.messagesPerMonth > 0) {
          // For now, we're not implementing message-based credits
          // This would be where you'd add monthly message quota
          logger.info({ userId: sub.userId, tier: sub.tier }, 'Subscription renewal invoice paid');
        }
      }
    }

    logger.info({ invoiceId: invoice.id, status: 'paid' }, 'Invoice paid');
  }

  /**
   * Handle invoice.payment_failed event
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    if (invoice.subscription) {
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: invoice.subscription as string },
      });

      if (sub) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        });

        logger.warn({ userId: sub.userId, invoiceId: invoice.id }, 'Payment failed for subscription');
      }
    }
  }

  /**
   * Handle customer.created event
   */
  private async handleCustomerCreated(customer: Stripe.Customer) {
    logger.info({ customerId: customer.id, email: customer.email }, 'Stripe customer created');
  }

  /**
   * Handle payment_method.attached event
   */
  private async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
    logger.info({
      paymentMethodId: paymentMethod.id,
      customerId: paymentMethod.customer
    }, 'Payment method attached');
  }
}

export const webhookService = new WebhookService();
