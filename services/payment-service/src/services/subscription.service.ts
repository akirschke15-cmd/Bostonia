import { prisma } from '@bostonia/database';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import {
  SUBSCRIPTION_PLANS,
  getPlanById,
  mapPrismaTierToApiTier,
  mapApiTierToPrismaTier,
  type SubscriptionPlan,
} from '../config/plans.js';

export interface SubscriptionWithFeatures {
  id: string;
  userId: string;
  tier: 'free' | 'plus' | 'pro';
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  features: {
    messagesPerMonth: number;
    messagesUsed: number;
    prioritySupport: boolean;
    customPersonas: boolean;
    advancedMemory: boolean;
    voiceMessages: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class SubscriptionService {
  /**
   * Get current subscription for a user
   */
  async getCurrentSubscription(userId: string): Promise<SubscriptionWithFeatures | null> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      // Return free tier info if no active subscription
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return null;

      const freePlan = SUBSCRIPTION_PLANS.find(p => p.tier === 'free')!;
      return {
        id: 'free',
        userId,
        tier: 'free',
        status: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        features: {
          ...freePlan.features,
          messagesUsed: 0, // TODO: track actual usage
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    }

    const tier = mapPrismaTierToApiTier(subscription.tier);
    const plan = SUBSCRIPTION_PLANS.find(p => p.tier === tier)!;

    return {
      id: subscription.id,
      userId: subscription.userId,
      tier,
      status: subscription.status.toLowerCase(),
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      features: {
        ...plan.features,
        messagesUsed: 0, // TODO: track actual usage
      },
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  /**
   * Get all available subscription plans
   */
  getPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  /**
   * Create a Stripe checkout session for a new subscription
   */
  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; checkoutUrl: string; expiresAt: Date }> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const plan = getPlanById(planId);
    if (!plan || plan.tier === 'free') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid plan ID');
    }

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
    });

    if (existingSubscription) {
      throw new AppError(
        ErrorCodes.CONFLICT,
        'You already have an active subscription. Please update or cancel your current subscription first.'
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    // Get or create Stripe customer
    let customerId: string;
    const existingSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSub?.stripeCustomerId) {
      customerId = existingSub.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, planId, tier: plan.tier },
      subscription_data: {
        metadata: { userId, planId, tier: plan.tier },
      },
    });

    logger.info({ userId, planId, sessionId: session.id }, 'Checkout session created');

    return {
      sessionId: session.id,
      checkoutUrl: session.url!,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  /**
   * Update subscription to a different plan
   */
  async updateSubscription(
    userId: string,
    newPlanId: string,
    prorationBehavior: 'create_prorations' | 'none' | 'always_invoice' = 'create_prorations'
  ): Promise<SubscriptionWithFeatures> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const plan = getPlanById(newPlanId);
    if (!plan || plan.tier === 'free') {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid plan ID');
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING'] } },
    });

    if (!subscription) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No active subscription found to update');
    }

    // Update the subscription in Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSubscription.items.data[0]?.id,
        price: plan.stripePriceId,
      }],
      proration_behavior: prorationBehavior,
      metadata: { userId, planId: newPlanId, tier: plan.tier },
    });

    // Update local record
    const prismaTier = mapApiTierToPrismaTier(plan.tier);
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        tier: prismaTier,
        stripePriceId: plan.stripePriceId!,
      },
    });

    // Update user tier
    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionTier: prismaTier },
    });

    logger.info({ userId, newPlanId }, 'Subscription updated');

    return (await this.getCurrentSubscription(userId))!;
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(
    userId: string,
    reason?: string,
    feedback?: string,
    cancelImmediately: boolean = false
  ): Promise<SubscriptionWithFeatures> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    });

    if (!subscription) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'No active subscription found');
    }

    if (cancelImmediately) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
        },
      });

      // Update user to free tier immediately
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: 'FREE',
          subscriptionExpiresAt: null,
        },
      });
    } else {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          cancellation_reason: reason || '',
          cancellation_feedback: feedback || '',
        },
      });

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    }

    logger.info({ userId, reason, cancelImmediately }, 'Subscription cancellation requested');

    return (await this.getCurrentSubscription(userId))!;
  }

  /**
   * Resume a cancelled subscription
   */
  async resumeSubscription(userId: string): Promise<SubscriptionWithFeatures> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', cancelAtPeriodEnd: true },
    });

    if (!subscription) {
      throw new AppError(
        ErrorCodes.INVALID_INPUT,
        'Subscription is not scheduled for cancellation or has already expired'
      );
    }

    // Resume in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update local record
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    logger.info({ userId }, 'Subscription resumed');

    return (await this.getCurrentSubscription(userId))!;
  }

  /**
   * Get or create Stripe customer ID for a user
   */
  async getOrCreateStripeCustomer(userId: string): Promise<string> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    // Check if user already has a Stripe customer ID
    const existingSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSub?.stripeCustomerId) {
      return existingSub.stripeCustomerId;
    }

    // Create new customer
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });

    return customer.id;
  }
}

export const subscriptionService = new SubscriptionService();
