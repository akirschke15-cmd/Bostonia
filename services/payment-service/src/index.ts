import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import Stripe from 'stripe';
import { prisma } from '@bostonia/database';
import {
  successResponse,
  errorResponse,
  ErrorCodes,
  getEnv,
  requireEnv,
  createCheckoutSessionSchema,
  purchaseCreditsSchema,
} from '@bostonia/shared';

const logger = pino({ level: getEnv('LOG_LEVEL', 'info') });
const PORT = parseInt(getEnv('PORT', '3005'), 10);

// Make Stripe optional in development
const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY', '');
if (!STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY not set - payment service running in mock mode');
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

const PRICE_IDS = {
  basic: process.env['STRIPE_PRICE_BASIC'] || 'price_basic',
  premium: process.env['STRIPE_PRICE_PREMIUM'] || 'price_premium',
  unlimited: process.env['STRIPE_PRICE_UNLIMITED'] || 'price_unlimited',
};

const TIER_CREDITS: Record<string, number> = {
  basic: 500,
  premium: 2000,
  unlimited: 999999,
};

const app = express();

// Use raw body for webhook
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(helmet());
app.use(cors({ origin: getEnv('FRONTEND_URL', 'http://localhost:3000'), credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json(successResponse({
    status: 'healthy',
    service: 'payment-service',
    stripeConfigured: !!stripe
  }));
});

// Middleware to check if Stripe is configured for payment routes
const requireStripe = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!stripe) {
    return res.status(503).json(errorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'Payment service not configured - STRIPE_SECRET_KEY not set'
    ));
  }
  next();
};

// Apply to all payment routes except health check
app.use('/api/payments', requireStripe);

// Create checkout session for subscription
app.post('/api/payments/checkout/subscription', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const { tier, successUrl, cancelUrl } = createCheckoutSessionSchema.parse(req.body);
    const priceId = PRICE_IDS[tier as keyof typeof PRICE_IDS];

    if (!priceId) {
      return res.status(400).json(errorResponse(ErrorCodes.INVALID_INPUT, 'Invalid subscription tier'));
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
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
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, tier },
    });

    res.json(successResponse({ sessionId: session.id, url: session.url }));
  } catch (error) {
    logger.error(error, 'Error creating checkout session');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout'));
  }
});

// Create checkout session for credit purchase
app.post('/api/payments/checkout/credits', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const { amount, successUrl, cancelUrl } = purchaseCreditsSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    // Price: $1 per 100 credits
    const priceInCents = Math.ceil(amount / 100) * 100;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `${amount} Credits` },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, credits: amount.toString(), type: 'credit_purchase' },
    });

    res.json(successResponse({ sessionId: session.id, url: session.url }));
  } catch (error) {
    logger.error(error, 'Error creating credit checkout');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkout'));
  }
});

// Get subscription status
app.get('/api/payments/subscription', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return res.json(successResponse({ hasSubscription: false }));
    }

    res.json(successResponse({
      hasSubscription: true,
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    }));
  } catch (error) {
    logger.error(error, 'Error fetching subscription');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch subscription'));
  }
});

// Cancel subscription
app.post('/api/payments/subscription/cancel', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });

    if (!subscription) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'No active subscription'));
    }

    // Cancel at period end in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local record
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json(successResponse({ message: 'Subscription will cancel at period end' }));
  } catch (error) {
    logger.error(error, 'Error canceling subscription');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to cancel subscription'));
  }
});

// Stripe webhook
app.post('/api/payments/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

  if (!webhookSecret) {
    logger.warn('Stripe webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error(err, 'Webhook signature verification failed');
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, tier, credits, type } = session.metadata || {};

        if (type === 'credit_purchase' && credits && userId) {
          // Credit purchase completed
          const creditAmount = parseInt(credits, 10);

          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { credits: { increment: creditAmount } },
            }),
            prisma.creditTransaction.create({
              data: {
                userId,
                type: 'PURCHASE',
                amount: creditAmount,
                balance: 0, // Will be updated
                description: `Purchased ${creditAmount} credits`,
                referenceId: session.id,
              },
            }),
          ]);

          logger.info({ userId, credits: creditAmount }, 'Credit purchase completed');
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const existingSub = await prisma.subscription.findFirst({
          where: { stripeCustomerId: customerId },
        });

        const userId = existingSub?.userId || (subscription.metadata?.['userId'] as string);

        if (!userId) {
          logger.warn({ customerId }, 'Could not find user for subscription');
          break;
        }

        const tierFromPrice = Object.entries(PRICE_IDS).find(
          ([_, priceId]) => subscription.items.data[0]?.price.id === priceId
        )?.[0] || 'basic';

        // Upsert subscription
        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: subscription.id },
          update: {
            status: subscription.status.toUpperCase() as any,
            tier: tierFromPrice.toUpperCase() as any,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
          create: {
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price.id || '',
            tier: tierFromPrice.toUpperCase() as any,
            status: subscription.status.toUpperCase() as any,
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          },
        });

        // Update user subscription tier and add credits
        const tierCredits = TIER_CREDITS[tierFromPrice] || 0;
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: tierFromPrice.toUpperCase() as any,
            subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
            credits: { increment: tierCredits },
          },
        });

        logger.info({ userId, tier: tierFromPrice }, 'Subscription updated');
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
          },
        });

        // Reset user to free tier
        const sub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (sub) {
          await prisma.user.update({
            where: { id: sub.userId },
            data: {
              subscriptionTier: 'FREE',
              subscriptionExpiresAt: null,
            },
          });
        }

        logger.info({ subscriptionId: subscription.id }, 'Subscription canceled');
        break;
      }

      default:
        logger.debug({ type: event.type }, 'Unhandled webhook event');
    }

    res.json({ received: true });
  } catch (error) {
    logger.error(error, 'Webhook processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get pricing info
app.get('/api/payments/pricing', async (_req, res) => {
  res.json(successResponse({
    tiers: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        credits: 100,
        features: ['100 messages/month', 'Basic characters', 'Standard response time'],
      },
      {
        id: 'basic',
        name: 'Basic',
        price: 9.99,
        credits: 500,
        features: ['500 messages/month', 'All characters', 'Faster responses', 'Chat export'],
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 19.99,
        credits: 2000,
        features: ['2000 messages/month', 'Priority access', 'Advanced memory', 'Character creation'],
      },
      {
        id: 'unlimited',
        name: 'Unlimited',
        price: 49.99,
        credits: 999999,
        features: ['Unlimited messages', 'Everything in Premium', 'API access', 'Priority support'],
      },
    ],
    creditPacks: [
      { credits: 100, price: 1 },
      { credits: 500, price: 4.5 },
      { credits: 1000, price: 8 },
    ],
  }));
});

app.listen(PORT, () => {
  logger.info(`Payment service listening on port ${PORT}`);
});
