// Subscription plans configuration
export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'free' | 'plus' | 'pro';
  price: number; // in cents
  currency: string;
  interval: 'month' | 'year';
  stripePriceId?: string;
  features: {
    messagesPerMonth: number; // -1 for unlimited
    prioritySupport: boolean;
    customPersonas: boolean;
    advancedMemory: boolean;
    voiceMessages: boolean;
  };
  popular: boolean;
}

export interface CreditPackage {
  id: string;
  credits: number;
  price: number; // in cents
  currency: string;
  stripePriceId?: string;
  bonus: number;
  popular: boolean;
}

// Subscription plans as per API spec
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free',
    name: 'Free',
    tier: 'free',
    price: 0,
    currency: 'usd',
    interval: 'month',
    features: {
      messagesPerMonth: 50,
      prioritySupport: false,
      customPersonas: false,
      advancedMemory: false,
      voiceMessages: false,
    },
    popular: false,
  },
  {
    id: 'plan_plus',
    name: 'Plus',
    tier: 'plus',
    price: 999, // $9.99
    currency: 'usd',
    interval: 'month',
    stripePriceId: process.env['STRIPE_PRICE_PLUS'] || 'price_plus_monthly',
    features: {
      messagesPerMonth: 2000,
      prioritySupport: true,
      customPersonas: true,
      advancedMemory: true,
      voiceMessages: false,
    },
    popular: true,
  },
  {
    id: 'plan_pro',
    name: 'Pro',
    tier: 'pro',
    price: 1999, // $19.99
    currency: 'usd',
    interval: 'month',
    stripePriceId: process.env['STRIPE_PRICE_PRO'] || 'price_pro_monthly',
    features: {
      messagesPerMonth: -1, // unlimited
      prioritySupport: true,
      customPersonas: true,
      advancedMemory: true,
      voiceMessages: true,
    },
    popular: false,
  },
];

// Credit packages as per API spec
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'credits_500',
    credits: 500,
    price: 499, // $4.99
    currency: 'usd',
    stripePriceId: process.env['STRIPE_PRICE_CREDITS_500'] || 'price_credits_500',
    bonus: 0,
    popular: false,
  },
  {
    id: 'credits_1000',
    credits: 1000,
    price: 999, // $9.99
    currency: 'usd',
    stripePriceId: process.env['STRIPE_PRICE_CREDITS_1000'] || 'price_credits_1000',
    bonus: 0,
    popular: true,
  },
  {
    id: 'credits_2500',
    credits: 2500,
    price: 2299, // $22.99
    currency: 'usd',
    stripePriceId: process.env['STRIPE_PRICE_CREDITS_2500'] || 'price_credits_2500',
    bonus: 250,
    popular: false,
  },
  {
    id: 'credits_5000',
    credits: 5000,
    price: 4299, // $42.99
    currency: 'usd',
    stripePriceId: process.env['STRIPE_PRICE_CREDITS_5000'] || 'price_credits_5000',
    bonus: 750,
    popular: false,
  },
  {
    id: 'credits_10000',
    credits: 10000,
    price: 7999, // $79.99
    currency: 'usd',
    stripePriceId: process.env['STRIPE_PRICE_CREDITS_10000'] || 'price_credits_10000',
    bonus: 2000,
    popular: false,
  },
];

// Helper functions
export function getPlanById(planId: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId);
}

export function getPlanByTier(tier: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.tier === tier);
}

export function getCreditPackageById(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === packageId);
}

// Map Prisma subscription tier to API tier
export function mapPrismaTierToApiTier(prismaTier: string): 'free' | 'plus' | 'pro' {
  const mapping: Record<string, 'free' | 'plus' | 'pro'> = {
    'FREE': 'free',
    'BASIC': 'plus', // Map BASIC to plus
    'PREMIUM': 'pro', // Map PREMIUM to pro
    'UNLIMITED': 'pro',
  };
  return mapping[prismaTier] || 'free';
}

// Map API tier to Prisma tier
export function mapApiTierToPrismaTier(apiTier: string): 'FREE' | 'BASIC' | 'PREMIUM' | 'UNLIMITED' {
  const mapping: Record<string, 'FREE' | 'BASIC' | 'PREMIUM' | 'UNLIMITED'> = {
    'free': 'FREE',
    'plus': 'BASIC',
    'pro': 'PREMIUM',
  };
  return mapping[apiTier] || 'FREE';
}
