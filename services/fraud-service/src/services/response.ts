import { prisma } from '@bostonia/database';
import { logger } from '../lib/logger.js';
import { getRedis } from '../lib/redis.js';

type FraudActionType =
  | 'REVENUE_HOLD'
  | 'REVENUE_CLAWBACK'
  | 'RATE_LIMIT'
  | 'SHADOW_BAN'
  | 'TEMPORARY_SUSPEND'
  | 'PERMANENT_BAN'
  | 'PAYOUT_BLOCK'
  | 'WARNING_ISSUED'
  | 'MONITORING_INCREASED';

interface ActionContext {
  caseId?: string;
  userId: string;
  reason: string;
  severity: 'warning' | 'temporary' | 'permanent';
  duration?: number; // Hours for temporary actions
  isAutomated: boolean;
  executedBy?: string;
}

export class FraudResponseService {
  /**
   * Execute an automated or manual fraud response action.
   */
  async executeAction(actionType: FraudActionType, ctx: ActionContext): Promise<void> {
    logger.info(
      {
        actionType,
        userId: ctx.userId,
        isAutomated: ctx.isAutomated,
      },
      'Executing fraud response action'
    );

    // Execute the action
    switch (actionType) {
      case 'WARNING_ISSUED':
        await this.issueWarning(ctx.userId, ctx.reason);
        break;

      case 'REVENUE_HOLD':
        await this.holdRevenue(ctx.userId, ctx.reason);
        break;

      case 'REVENUE_CLAWBACK':
        await this.clawbackRevenue(ctx.userId, ctx.reason);
        break;

      case 'RATE_LIMIT':
        await this.applyRateLimit(ctx.userId, ctx.duration || 24);
        break;

      case 'SHADOW_BAN':
        await this.applyShadowBan(ctx.userId);
        break;

      case 'TEMPORARY_SUSPEND':
        await this.temporarySuspend(ctx.userId, ctx.duration || 24);
        break;

      case 'PERMANENT_BAN':
        await this.permanentBan(ctx.userId, ctx.reason);
        break;

      case 'PAYOUT_BLOCK':
        await this.blockPayouts(ctx.userId);
        break;

      case 'MONITORING_INCREASED':
        await this.increaseMonitoring(ctx.userId);
        break;
    }
  }

  private async issueWarning(userId: string, reason: string): Promise<void> {
    logger.info({ userId, reason }, 'Issuing warning');

    // Send notification (email, in-app)
    await this.sendNotification(userId, {
      type: 'fraud_warning',
      title: 'Account Activity Notice',
      message:
        `We've detected unusual activity on your account. ` +
        `Please review our terms of service. Continued violations ` +
        `may result in account restrictions.`,
      reason: reason,
    });
  }

  private async holdRevenue(userId: string, reason: string): Promise<void> {
    logger.info({ userId, reason }, 'Holding revenue');

    // In production, update payment service to block payouts
    await this.sendNotification(userId, {
      type: 'revenue_hold',
      title: 'Payout Hold Notice',
      message:
        `Your pending payouts have been temporarily held ` +
        `while we review recent activity. This typically takes ` +
        `5-7 business days. You can contact support for more information.`,
    });
  }

  private async clawbackRevenue(userId: string, reason: string): Promise<void> {
    logger.info({ userId, reason }, 'Clawing back revenue');

    // In production, calculate and deduct fraudulent revenue
    await this.sendNotification(userId, {
      type: 'revenue_clawback',
      title: 'Revenue Adjustment Notice',
      message:
        `Following our review, some earnings have been deducted ` +
        `from your account due to policy violations. ` +
        `You may appeal this decision within 30 days.`,
    });
  }

  private async applyRateLimit(userId: string, hours: number): Promise<void> {
    logger.info({ userId, hours }, 'Applying strict rate limit');

    // Set stricter rate limits in Redis
    const redis = await getRedis();
    await redis.setex(
      `rate_limit:strict:${userId}`,
      hours * 3600,
      JSON.stringify({
        messages_per_minute: 3,
        messages_per_hour: 30,
        conversations_per_hour: 5,
      })
    );
  }

  private async applyShadowBan(userId: string): Promise<void> {
    logger.info({ userId }, 'Applying shadow ban');

    // Set flag in Redis for real-time checking
    const redis = await getRedis();
    await redis.set(`shadow_ban:${userId}`, '1');
  }

  private async temporarySuspend(userId: string, hours: number): Promise<void> {
    const suspendUntil = new Date(Date.now() + hours * 3600000);

    logger.info({ userId, suspendUntil }, 'Temporarily suspending account');

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'SUSPENDED',
      },
    });

    // Revoke all sessions
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    await this.sendNotification(userId, {
      type: 'temporary_suspension',
      title: 'Account Temporarily Suspended',
      message:
        `Your account has been temporarily suspended until ` +
        `${suspendUntil.toLocaleString()} due to policy violations. ` +
        `You can appeal this decision.`,
    });
  }

  private async permanentBan(userId: string, reason: string): Promise<void> {
    logger.info({ userId, reason }, 'Permanently banning account');

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
      },
    });

    // Revoke all sessions
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    // Mark all characters as banned
    await prisma.character.updateMany({
      where: { creatorId: userId },
      data: { status: 'BANNED' },
    });

    await this.sendNotification(userId, {
      type: 'permanent_ban',
      title: 'Account Permanently Banned',
      message:
        `Your account has been permanently banned for severe ` +
        `policy violations. You may submit an appeal within 30 days.`,
    });
  }

  private async blockPayouts(userId: string): Promise<void> {
    logger.info({ userId }, 'Blocking payouts');

    // Set flag in Redis
    const redis = await getRedis();
    await redis.set(`payout_blocked:${userId}`, '1');
  }

  private async increaseMonitoring(userId: string): Promise<void> {
    logger.info({ userId }, 'Increasing monitoring');

    // Set flag for enhanced logging
    const redis = await getRedis();
    await redis.setex(`enhanced_monitoring:${userId}`, 30 * 86400, '1');
  }

  /**
   * Check if a user is shadow banned.
   */
  async isShadowBanned(userId: string): Promise<boolean> {
    const redis = await getRedis();
    const result = await redis.get(`shadow_ban:${userId}`);
    return result === '1';
  }

  /**
   * Check if a user has strict rate limits.
   */
  async getStrictRateLimits(
    userId: string
  ): Promise<{ messages_per_minute: number; messages_per_hour: number } | null> {
    const redis = await getRedis();
    const result = await redis.get(`rate_limit:strict:${userId}`);
    return result ? JSON.parse(result) : null;
  }

  /**
   * Reverse a shadow ban.
   */
  async reverseShadowBan(userId: string): Promise<void> {
    const redis = await getRedis();
    await redis.del(`shadow_ban:${userId}`);
    logger.info({ userId }, 'Shadow ban reversed');
  }

  /**
   * Reverse rate limits.
   */
  async reverseRateLimits(userId: string): Promise<void> {
    const redis = await getRedis();
    await redis.del(`rate_limit:strict:${userId}`);
    logger.info({ userId }, 'Rate limits reversed');
  }

  private async sendNotification(
    userId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      reason?: string;
    }
  ): Promise<void> {
    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) return;

    // In production, use email service
    logger.info(
      {
        userId,
        email: user.email,
        type: notification.type,
        title: notification.title,
      },
      'Sending notification'
    );
  }
}

export const fraudResponseService = new FraudResponseService();
