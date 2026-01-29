import { prisma } from '@bostonia/database';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';

// Creator payouts are stubbed as per requirements
// Full implementation would require Stripe Connect setup

export interface EarningsSummary {
  totalEarnings: number;
  pendingPayout: number;
  availableForPayout: number;
  lifetimePaid: number;
  currency: string;
  revenueShareRate: number;
  minimumPayout: number;
  breakdown: {
    subscriptionShare: number;
    premiumUnlocks: number;
    tips: number;
  };
  thisMonth: {
    earnings: number;
    interactions: number;
    uniqueUsers: number;
  };
}

export interface EarningEntry {
  id: string;
  characterId: string;
  characterName: string;
  type: 'subscription_share' | 'premium_unlock' | 'tip';
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  userId: string;
  createdAt: Date;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripeTransferId: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  failureReason: string | null;
}

export interface StripeConnectStatus {
  hasAccount: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pendingVerification: string[];
  };
}

const REVENUE_SHARE_RATE = 0.70; // 70% to creators
const MINIMUM_PAYOUT = 5000; // $50 in cents

export class CreatorService {
  /**
   * Check if user is a creator
   */
  async isCreator(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.role === 'CREATOR' || user?.role === 'ADMIN';
  }

  /**
   * Get earnings summary for a creator (stubbed)
   */
  async getEarningsSummary(userId: string, startDate?: Date, endDate?: Date): Promise<EarningsSummary> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to access earnings');
    }

    // Stubbed response - in production, this would aggregate actual earnings data
    return {
      totalEarnings: 0,
      pendingPayout: 0,
      availableForPayout: 0,
      lifetimePaid: 0,
      currency: 'usd',
      revenueShareRate: REVENUE_SHARE_RATE,
      minimumPayout: MINIMUM_PAYOUT,
      breakdown: {
        subscriptionShare: 0,
        premiumUnlocks: 0,
        tips: 0,
      },
      thisMonth: {
        earnings: 0,
        interactions: 0,
        uniqueUsers: 0,
      },
    };
  }

  /**
   * Get detailed earnings history (stubbed)
   */
  async getEarningsHistory(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      characterId?: string;
      type?: string;
    } = {}
  ): Promise<{ entries: EarningEntry[]; total: number }> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to access earnings');
    }

    // Stubbed response
    return { entries: [], total: 0 };
  }

  /**
   * Get payout history (stubbed)
   */
  async getPayoutHistory(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
    } = {}
  ): Promise<{ payouts: Payout[]; total: number }> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to access payouts');
    }

    // Stubbed response
    return { payouts: [], total: 0 };
  }

  /**
   * Request a payout (stubbed)
   */
  async requestPayout(userId: string, amount?: number): Promise<Payout> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to request payouts');
    }

    const summary = await this.getEarningsSummary(userId);

    if (summary.availableForPayout < MINIMUM_PAYOUT) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Minimum payout amount is $50.00', {
        minimumAmount: MINIMUM_PAYOUT,
        availableAmount: summary.availableForPayout,
      });
    }

    const requestedAmount = amount || summary.availableForPayout;

    if (requestedAmount > summary.availableForPayout) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Requested amount exceeds available balance', {
        requestedAmount,
        availableAmount: summary.availableForPayout,
      });
    }

    // Check Stripe Connect status
    const connectStatus = await this.getStripeConnectStatus(userId);
    if (!connectStatus.hasAccount || !connectStatus.payoutsEnabled) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Please complete your Stripe Connect setup before requesting payouts'
      );
    }

    // Stubbed payout response
    logger.info({ userId, amount: requestedAmount }, 'Payout requested (stubbed)');

    return {
      id: `payout_${Date.now()}`,
      amount: requestedAmount,
      currency: 'usd',
      status: 'pending',
      stripeTransferId: null,
      requestedAt: new Date(),
      processedAt: null,
      completedAt: null,
      failureReason: null,
    };
  }

  /**
   * Setup Stripe Connect account (stubbed)
   */
  async setupStripeConnect(
    userId: string,
    refreshUrl: string,
    returnUrl: string
  ): Promise<{ accountLinkUrl: string; expiresAt: Date }> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to set up payouts');
    }

    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    // In production, this would create a Stripe Connect account and return an account link
    logger.info({ userId }, 'Stripe Connect setup requested (stubbed)');

    return {
      accountLinkUrl: `${returnUrl}?setup=stubbed`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };
  }

  /**
   * Get Stripe Connect account status (stubbed)
   */
  async getStripeConnectStatus(userId: string): Promise<StripeConnectStatus> {
    const isCreator = await this.isCreator(userId);
    if (!isCreator) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'You must be a verified creator to access this');
    }

    // Stubbed response - no account set up
    return {
      hasAccount: false,
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirements: {
        currentlyDue: [],
        eventuallyDue: [],
        pendingVerification: [],
      },
    };
  }
}

export const creatorService = new CreatorService();
