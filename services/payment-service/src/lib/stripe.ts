import Stripe from 'stripe';
import { getEnv } from '@bostonia/shared';
import { logger } from './logger.js';

const STRIPE_SECRET_KEY = getEnv('STRIPE_SECRET_KEY', '');

// Make Stripe optional in development for testing without credentials
if (!STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY not set - payment service running in mock mode');
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

export function isStripeConfigured(): boolean {
  return stripe !== null;
}

export function getStripeWebhookSecret(): string | undefined {
  return process.env['STRIPE_WEBHOOK_SECRET'];
}
