import { prisma } from '@bostonia/database';
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';
import { CREDIT_PACKAGES, getCreditPackageById, type CreditPackage } from '../config/plans.js';

export interface CreditBalance {
  balance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  lifetimeEarned: number;
  lastPurchaseAt: Date | null;
  lastUsageAt: Date | null;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balance: number;
  description: string;
  referenceId: string | null;
  createdAt: Date;
}

export interface DeductCreditsResult {
  transactionId: string;
  previousBalance: number;
  amountDeducted: number;
  newBalance: number;
}

// Store for idempotency keys (in production, use Redis)
const processedIdempotencyKeys = new Map<string, DeductCreditsResult>();

export class CreditService {
  /**
   * Get credit balance for a user
   */
  async getBalance(userId: string): Promise<CreditBalance> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    // Calculate lifetime stats from transactions
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    let lifetimePurchased = 0;
    let lifetimeUsed = 0;
    let lifetimeEarned = 0;
    let lastPurchaseAt: Date | null = null;
    let lastUsageAt: Date | null = null;

    for (const txn of transactions) {
      if (txn.type === 'PURCHASE' || txn.type === 'SUBSCRIPTION') {
        lifetimePurchased += txn.amount;
        if (!lastPurchaseAt) lastPurchaseAt = txn.createdAt;
      } else if (txn.type === 'USAGE') {
        lifetimeUsed += Math.abs(txn.amount);
        if (!lastUsageAt) lastUsageAt = txn.createdAt;
      } else if (txn.type === 'BONUS') {
        lifetimeEarned += txn.amount;
      }
    }

    return {
      balance: user.credits,
      lifetimePurchased,
      lifetimeUsed,
      lifetimeEarned,
      lastPurchaseAt,
      lastUsageAt,
    };
  }

  /**
   * Get available credit packages
   */
  getPackages(): CreditPackage[] {
    return CREDIT_PACKAGES;
  }

  /**
   * Create a checkout session for purchasing credits
   */
  async purchaseCredits(
    userId: string,
    packageId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; checkoutUrl: string; expiresAt: Date }> {
    if (!stripe) {
      throw new AppError(ErrorCodes.SERVICE_UNAVAILABLE, 'Stripe not configured');
    }

    const creditPackage = getCreditPackageById(packageId);
    if (!creditPackage) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid package ID');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    // Get or create Stripe customer
    let customerId: string | undefined;
    const existingSub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSub?.stripeCustomerId) {
      customerId = existingSub.stripeCustomerId;
    }

    const totalCredits = creditPackage.credits + creditPackage.bonus;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: 'payment',
      line_items: [{
        price: creditPackage.stripePriceId,
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        packageId,
        credits: totalCredits.toString(),
        type: 'credit_purchase',
      },
    });

    logger.info({ userId, packageId, sessionId: session.id }, 'Credit checkout session created');

    return {
      sessionId: session.id,
      checkoutUrl: session.url!,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  /**
   * Get credit transaction history
   */
  async getTransactions(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      type?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ transactions: CreditTransaction[]; total: number }> {
    const { page = 1, limit = 20, type, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (type) {
      where.type = type.toUpperCase();
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.creditTransaction.count({ where }),
    ]);

    return {
      transactions: transactions.map(txn => ({
        id: txn.id,
        type: txn.type.toLowerCase(),
        amount: txn.amount,
        balance: txn.balance,
        description: txn.description,
        referenceId: txn.referenceId,
        createdAt: txn.createdAt,
      })),
      total,
    };
  }

  /**
   * Deduct credits from a user's balance (internal endpoint for other services)
   */
  async deductCredits(
    userId: string,
    amount: number,
    description: string,
    referenceType?: string,
    referenceId?: string,
    idempotencyKey?: string
  ): Promise<DeductCreditsResult> {
    // Check idempotency
    if (idempotencyKey) {
      const existing = processedIdempotencyKeys.get(idempotencyKey);
      if (existing) {
        logger.info({ idempotencyKey }, 'Returning cached deduction result');
        return existing;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    if (user.credits < amount) {
      throw new AppError(ErrorCodes.INSUFFICIENT_CREDITS, 'User does not have enough credits', {
        required: amount,
        available: user.credits,
      });
    }

    const previousBalance = user.credits;
    const newBalance = previousBalance - amount;

    // Perform deduction atomically
    const [updatedUser, transaction] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: { decrement: amount } },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          type: 'USAGE',
          amount: -amount,
          balance: newBalance,
          description,
          referenceId: referenceId || null,
          metadata: referenceType ? { referenceType } : undefined,
        },
      }),
    ]);

    const result: DeductCreditsResult = {
      transactionId: transaction.id,
      previousBalance,
      amountDeducted: amount,
      newBalance: updatedUser.credits,
    };

    // Store idempotency result
    if (idempotencyKey) {
      processedIdempotencyKeys.set(idempotencyKey, result);
      // Clean up after 24 hours (in production, use Redis with TTL)
      setTimeout(() => processedIdempotencyKeys.delete(idempotencyKey), 24 * 60 * 60 * 1000);
    }

    logger.info({ userId, amount, newBalance: updatedUser.credits }, 'Credits deducted');

    return result;
  }

  /**
   * Add credits to a user's balance (used by webhooks)
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'PURCHASE' | 'BONUS' | 'REFUND' | 'SUBSCRIPTION',
    description: string,
    referenceId?: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    const newBalance = user.credits + amount;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: amount } },
      }),
      prisma.creditTransaction.create({
        data: {
          userId,
          type,
          amount,
          balance: newBalance,
          description,
          referenceId: referenceId || null,
        },
      }),
    ]);

    logger.info({ userId, amount, type, newBalance }, 'Credits added');
  }
}

export const creditService = new CreditService();
