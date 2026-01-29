'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Check,
  Sparkles,
  Zap,
  Crown,
  Infinity,
  Coins,
  Loader2,
} from 'lucide-react';
import { paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Header } from '@/components/header';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface PricingTier {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  credits: number;
  features: string[];
  popular?: boolean;
}

interface CreditPack {
  id: string;
  amount: number;
  price: number;
  bonus?: number;
}

const tiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    credits: 50,
    features: [
      '50 credits per month',
      'Access to all characters',
      'Basic chat features',
      'Community support',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 9.99,
    interval: 'month',
    credits: 500,
    features: [
      '500 credits per month',
      'Access to all characters',
      'Priority response times',
      'Chat history export',
      'Email support',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 19.99,
    interval: 'month',
    credits: 2000,
    popular: true,
    features: [
      '2,000 credits per month',
      'Access to all characters',
      'Fastest response times',
      'Advanced memory features',
      'Voice messages (coming soon)',
      'Priority support',
    ],
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    price: 49.99,
    interval: 'month',
    credits: 999999,
    features: [
      'Unlimited credits',
      'Access to all characters',
      'All premium features',
      'Early access to new features',
      'Dedicated support',
      'API access (coming soon)',
    ],
  },
];

const creditPacks: CreditPack[] = [
  { id: 'pack-100', amount: 100, price: 1.99 },
  { id: 'pack-500', amount: 500, price: 7.99, bonus: 50 },
  { id: 'pack-1000', amount: 1000, price: 14.99, bonus: 150 },
  { id: 'pack-5000', amount: 5000, price: 59.99, bonus: 1000 },
];

export default function PricingPage() {
  const { isAuthenticated, user } = useAuthStore();
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  // Fetch current subscription
  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => paymentsApi.subscription(),
    enabled: isAuthenticated,
  });

  const currentTier = (subscriptionData?.data as { tier: string })?.tier || 'free';

  // Subscribe mutation
  const subscribeMutation = useMutation({
    mutationFn: (tier: string) =>
      paymentsApi.checkoutSubscription({
        tier,
        successUrl: `${window.location.origin}/dashboard?subscription=success`,
        cancelUrl: `${window.location.origin}/pricing?subscription=cancelled`,
      }),
    onSuccess: (response) => {
      const data = response.data as { url: string };
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast.error('Failed to start checkout. Please try again.');
    },
  });

  // Buy credits mutation
  const buyCredits = useMutation({
    mutationFn: (amount: number) =>
      paymentsApi.checkoutCredits({
        amount,
        successUrl: `${window.location.origin}/dashboard?credits=success`,
        cancelUrl: `${window.location.origin}/pricing?credits=cancelled`,
      }),
    onSuccess: (response) => {
      const data = response.data as { url: string };
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast.error('Failed to start checkout. Please try again.');
    },
  });

  const handleSubscribe = (tierId: string) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to subscribe');
      return;
    }
    if (tierId === 'free') return;
    subscribeMutation.mutate(tierId);
  };

  const handleBuyCredits = (pack: CreditPack) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to purchase credits');
      return;
    }
    setSelectedPack(pack.id);
    buyCredits.mutate(pack.amount);
  };

  const getTierIcon = (tierId: string) => {
    switch (tierId) {
      case 'free':
        return Sparkles;
      case 'basic':
        return Zap;
      case 'premium':
        return Crown;
      case 'unlimited':
        return Infinity;
      default:
        return Sparkles;
    }
  };

  return (
    <div className="min-h-screen bg-space-950 starfield">
      <Header />

      <main className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary-400 via-accent-400 to-stardust-400 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-space-300">
            Choose the plan that works best for you. All plans include access to
            our growing library of AI characters.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-2 p-1 bg-space-800 border border-space-700 rounded-lg">
            <button
              onClick={() => setBillingInterval('month')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                billingInterval === 'month'
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/25'
                  : 'text-space-400 hover:text-space-200'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('year')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                billingInterval === 'year'
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/25'
                  : 'text-space-400 hover:text-space-200'
              )}
            >
              Yearly
              <span className="ml-2 text-xs text-green-400 font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {tiers.map((tier) => {
            const Icon = getTierIcon(tier.id);
            const isCurrentPlan = currentTier.toLowerCase() === tier.id;
            const price =
              billingInterval === 'year'
                ? (tier.price * 12 * 0.8).toFixed(2)
                : tier.price.toFixed(2);

            return (
              <div
                key={tier.id}
                className={cn(
                  'relative cosmic-card rounded-2xl p-6 flex flex-col',
                  tier.popular && 'border-primary-500/50 shadow-lg shadow-primary-500/20',
                  isCurrentPlan && 'ring-2 ring-primary-500'
                )}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-gradient-to-r from-primary-500 to-accent-500 text-white text-xs font-semibold rounded-full shadow-lg shadow-primary-500/30">
                      Most Popular
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <span className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        tier.popular ? 'text-primary-400' : 'text-space-400'
                      )}
                    />
                    <h3 className="text-lg font-semibold text-space-100">{tier.name}</h3>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                      ${tier.price === 0 ? '0' : price}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-space-400">
                        /{billingInterval === 'year' ? 'year' : 'month'}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-space-400 mt-2">
                    {tier.credits === 999999
                      ? 'Unlimited credits'
                      : `${tier.credits.toLocaleString()} credits/month`}
                  </p>
                </div>

                <ul className="space-y-3 mb-6 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-space-200">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={
                    isCurrentPlan ||
                    tier.id === 'free' ||
                    subscribeMutation.isPending
                  }
                  className={cn(
                    'w-full py-3 rounded-lg font-medium transition-all',
                    tier.popular
                      ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-400 hover:to-accent-400 shadow-lg shadow-primary-500/25'
                      : 'bg-space-800 text-space-200 hover:bg-space-700 border border-space-700',
                    (isCurrentPlan || tier.id === 'free') &&
                      'opacity-50 cursor-not-allowed'
                  )}
                >
                  {subscribeMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : tier.id === 'free' ? (
                    'Free Forever'
                  ) : (
                    'Get Started'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Credit Packs */}
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2 text-space-100">Need More Credits?</h2>
            <p className="text-space-400">
              Purchase additional credits anytime. No subscription required.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {creditPacks.map((pack) => (
              <div
                key={pack.id}
                className="cosmic-card rounded-xl p-5 hover:shadow-lg hover:shadow-nova-500/10 transition-all group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Coins className="h-5 w-5 text-nova-400" />
                  <span className="font-semibold text-space-100">
                    {pack.amount.toLocaleString()} Credits
                  </span>
                </div>

                {pack.bonus && (
                  <p className="text-sm text-green-400 mb-2">
                    +{pack.bonus.toLocaleString()} bonus credits!
                  </p>
                )}

                <p className="text-2xl font-bold mb-4 bg-gradient-to-r from-nova-400 to-nova-300 bg-clip-text text-transparent">${pack.price}</p>

                <button
                  onClick={() => handleBuyCredits(pack)}
                  disabled={buyCredits.isPending && selectedPack === pack.id}
                  className="w-full py-2 rounded-lg bg-space-800 text-space-200 hover:bg-space-700 border border-space-700 font-medium transition-all disabled:opacity-50"
                >
                  {buyCredits.isPending && selectedPack === pack.id ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : (
                    'Buy Now'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-center mb-8 text-space-100">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <div className="cosmic-card rounded-xl p-6">
              <h3 className="font-semibold mb-2 text-space-100">What are credits?</h3>
              <p className="text-space-400">
                Credits are used to send messages to AI characters. Each message
                typically costs 1-5 credits depending on the response length.
                Credits refresh monthly with your subscription.
              </p>
            </div>

            <div className="cosmic-card rounded-xl p-6">
              <h3 className="font-semibold mb-2 text-space-100">Can I cancel anytime?</h3>
              <p className="text-space-400">
                Yes! You can cancel your subscription at any time. You'll
                continue to have access until the end of your billing period.
              </p>
            </div>

            <div className="cosmic-card rounded-xl p-6">
              <h3 className="font-semibold mb-2 text-space-100">Do unused credits roll over?</h3>
              <p className="text-space-400">
                Subscription credits reset each month. However, any bonus credits
                from purchases never expire and remain in your account.
              </p>
            </div>

            <div className="cosmic-card rounded-xl p-6">
              <h3 className="font-semibold mb-2 text-space-100">What payment methods do you accept?</h3>
              <p className="text-space-400">
                We accept all major credit cards (Visa, Mastercard, American
                Express) through our secure payment processor, Stripe.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
