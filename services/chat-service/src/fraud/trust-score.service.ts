/**
 * Trust Score Service
 *
 * Manages user trust scores for adaptive security measures.
 * Trust scores influence:
 * - Rate limits
 * - Challenge requirements
 * - Feature access
 * - Response handling
 */

import type { Redis } from 'ioredis';
import type {
  TrustScore,
  TrustTier,
  TrustFactor,
  TrustScoreChange,
  TRUST_THRESHOLDS,
} from '../types/fraud.types.js';

// Constants
const TRUST_SCORE_TTL = 86400 * 30; // 30 days
const HISTORY_MAX_ENTRIES = 100;

// Trust factor weights
const TRUST_FACTORS = {
  ACCOUNT_AGE: { name: 'Account Age', maxWeight: 15 },
  EMAIL_VERIFIED: { name: 'Email Verified', maxWeight: 10 },
  PAYMENT_HISTORY: { name: 'Payment History', maxWeight: 15 },
  BEHAVIOR_CONSISTENCY: { name: 'Behavior Consistency', maxWeight: 15 },
  DEVICE_REPUTATION: { name: 'Device Reputation', maxWeight: 10 },
  IP_REPUTATION: { name: 'IP Reputation', maxWeight: 10 },
  CONVERSATION_QUALITY: { name: 'Conversation Quality', maxWeight: 10 },
  FRAUD_FLAGS: { name: 'Fraud Flags', maxWeight: -30 },
  RATE_LIMIT_VIOLATIONS: { name: 'Rate Limit Violations', maxWeight: -15 },
  MANUAL_ADJUSTMENT: { name: 'Manual Adjustment', maxWeight: 20 },
};

export interface UserContext {
  userId: string;
  accountCreatedAt: Date;
  emailVerified: boolean;
  hasPaymentMethod: boolean;
  subscriptionTier: string;
  totalSpent: number;
  conversationCount: number;
  messageCount: number;
  reportCount: number;
  violationCount: number;
}

export class TrustScoreService {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix = 'bostonia:trust') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // TRUST SCORE CALCULATION
  // ===========================================================================

  /**
   * Get or calculate trust score for a user
   */
  async getTrustScore(userId: string): Promise<TrustScore | null> {
    const key = `${this.keyPrefix}:score:${userId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const score = JSON.parse(data) as TrustScore;
      score.lastUpdated = new Date(score.lastUpdated);
      score.history = score.history.map((h) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      }));
      return score;
    } catch {
      return null;
    }
  }

  /**
   * Calculate and update trust score based on user context
   */
  async calculateTrustScore(context: UserContext): Promise<TrustScore> {
    const factors: TrustFactor[] = [];
    let totalScore = 50; // Start with baseline

    // Account Age Factor
    const accountAge = this.calculateAccountAge(context.accountCreatedAt);
    const ageFactor = this.calculateAgeFactor(accountAge);
    factors.push(ageFactor);
    totalScore += ageFactor.value;

    // Email Verification Factor
    const emailFactor: TrustFactor = {
      name: TRUST_FACTORS.EMAIL_VERIFIED.name,
      weight: TRUST_FACTORS.EMAIL_VERIFIED.maxWeight,
      value: context.emailVerified ? TRUST_FACTORS.EMAIL_VERIFIED.maxWeight : 0,
      reason: context.emailVerified ? 'Email verified' : 'Email not verified',
    };
    factors.push(emailFactor);
    totalScore += emailFactor.value;

    // Payment History Factor
    const paymentFactor = this.calculatePaymentFactor(context);
    factors.push(paymentFactor);
    totalScore += paymentFactor.value;

    // Behavior Factor
    const behaviorFactor = this.calculateBehaviorFactor(context);
    factors.push(behaviorFactor);
    totalScore += behaviorFactor.value;

    // Violation Penalty
    const violationFactor = this.calculateViolationFactor(context);
    factors.push(violationFactor);
    totalScore += violationFactor.value;

    // Load existing adjustments
    const existingScore = await this.getTrustScore(context.userId);
    if (existingScore) {
      const manualAdj = existingScore.factors.find(
        (f) => f.name === TRUST_FACTORS.MANUAL_ADJUSTMENT.name
      );
      if (manualAdj && manualAdj.value !== 0) {
        factors.push(manualAdj);
        totalScore += manualAdj.value;
      }
    }

    // Clamp score to 0-100
    totalScore = Math.max(0, Math.min(100, totalScore));

    // Determine tier
    const tier = this.scoreToTier(totalScore);

    // Build trust score object
    const trustScore: TrustScore = {
      userId: context.userId,
      score: totalScore,
      tier,
      factors,
      lastUpdated: new Date(),
      history: existingScore?.history || [],
    };

    // Add to history if score changed significantly
    if (!existingScore || Math.abs(existingScore.score - totalScore) >= 5) {
      const change: TrustScoreChange = {
        timestamp: new Date(),
        previousScore: existingScore?.score || 50,
        newScore: totalScore,
        reason: 'Periodic recalculation',
        factors,
      };
      trustScore.history.unshift(change);

      // Trim history
      if (trustScore.history.length > HISTORY_MAX_ENTRIES) {
        trustScore.history = trustScore.history.slice(0, HISTORY_MAX_ENTRIES);
      }
    }

    // Store updated score
    await this.storeTrustScore(trustScore);

    return trustScore;
  }

  /**
   * Apply a manual trust score adjustment
   */
  async adjustTrustScore(
    userId: string,
    adjustment: number,
    reason: string,
    adminId: string
  ): Promise<TrustScore> {
    const existingScore = await this.getTrustScore(userId);

    if (!existingScore) {
      throw new Error('User trust score not found');
    }

    // Clamp adjustment
    adjustment = Math.max(
      -TRUST_FACTORS.MANUAL_ADJUSTMENT.maxWeight,
      Math.min(TRUST_FACTORS.MANUAL_ADJUSTMENT.maxWeight, adjustment)
    );

    // Find or create manual adjustment factor
    const manualFactorIndex = existingScore.factors.findIndex(
      (f) => f.name === TRUST_FACTORS.MANUAL_ADJUSTMENT.name
    );

    const manualFactor: TrustFactor = {
      name: TRUST_FACTORS.MANUAL_ADJUSTMENT.name,
      weight: TRUST_FACTORS.MANUAL_ADJUSTMENT.maxWeight,
      value: adjustment,
      reason: `${reason} (by admin: ${adminId})`,
    };

    if (manualFactorIndex >= 0) {
      existingScore.factors[manualFactorIndex] = manualFactor;
    } else {
      existingScore.factors.push(manualFactor);
    }

    // Recalculate total
    const previousScore = existingScore.score;
    let newScore = 50;
    for (const factor of existingScore.factors) {
      newScore += factor.value;
    }
    newScore = Math.max(0, Math.min(100, newScore));

    existingScore.score = newScore;
    existingScore.tier = this.scoreToTier(newScore);
    existingScore.lastUpdated = new Date();

    // Add to history
    const change: TrustScoreChange = {
      timestamp: new Date(),
      previousScore,
      newScore,
      reason: `Manual adjustment: ${reason}`,
      factors: [manualFactor],
    };
    existingScore.history.unshift(change);

    await this.storeTrustScore(existingScore);

    return existingScore;
  }

  // ===========================================================================
  // TRUST SCORE EVENTS
  // ===========================================================================

  /**
   * Record a positive trust event
   */
  async recordPositiveEvent(
    userId: string,
    eventType: string,
    points: number
  ): Promise<void> {
    const key = `${this.keyPrefix}:events:${userId}:positive`;
    await this.redis.hincrby(key, eventType, points);
    await this.redis.expire(key, TRUST_SCORE_TTL);
  }

  /**
   * Record a negative trust event
   */
  async recordNegativeEvent(
    userId: string,
    eventType: string,
    points: number
  ): Promise<void> {
    const key = `${this.keyPrefix}:events:${userId}:negative`;
    await this.redis.hincrby(key, eventType, points);
    await this.redis.expire(key, TRUST_SCORE_TTL);
  }

  /**
   * Get trust events for a user
   */
  async getTrustEvents(
    userId: string
  ): Promise<{ positive: Record<string, number>; negative: Record<string, number> }> {
    const [positive, negative] = await Promise.all([
      this.redis.hgetall(`${this.keyPrefix}:events:${userId}:positive`),
      this.redis.hgetall(`${this.keyPrefix}:events:${userId}:negative`),
    ]);

    return {
      positive: this.parseEventCounts(positive),
      negative: this.parseEventCounts(negative),
    };
  }

  // ===========================================================================
  // ADAPTIVE RATE LIMITS BASED ON TRUST
  // ===========================================================================

  /**
   * Get rate limit multiplier based on trust score
   */
  getRateLimitMultiplier(trustScore: TrustScore): number {
    switch (trustScore.tier) {
      case 'VERIFIED':
        return 2.0; // 2x normal limits
      case 'HIGH':
        return 1.5;
      case 'MEDIUM':
        return 1.0;
      case 'LOW':
        return 0.5; // Half normal limits
      case 'UNTRUSTED':
        return 0.25; // Quarter normal limits
      default:
        return 1.0;
    }
  }

  /**
   * Determine if challenges should be applied
   */
  shouldApplyChallenge(trustScore: TrustScore): {
    required: boolean;
    difficulty: number;
    reason: string;
  } {
    if (trustScore.tier === 'UNTRUSTED') {
      return { required: true, difficulty: 8, reason: 'Untrusted account' };
    }

    if (trustScore.tier === 'LOW') {
      return { required: true, difficulty: 5, reason: 'Low trust score' };
    }

    // Check for recent negative events
    const recentViolations = trustScore.factors.find(
      (f) => f.name === TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.name && f.value < -5
    );
    if (recentViolations) {
      return { required: true, difficulty: 6, reason: 'Recent rate limit violations' };
    }

    return { required: false, difficulty: 0, reason: '' };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private calculateAccountAge(createdAt: Date): number {
    const now = new Date();
    return Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calculateAgeFactor(ageDays: number): TrustFactor {
    let value = 0;
    let reason = '';

    if (ageDays < 1) {
      value = -5;
      reason = 'New account (< 1 day)';
    } else if (ageDays < 7) {
      value = 0;
      reason = 'Account age < 7 days';
    } else if (ageDays < 30) {
      value = 5;
      reason = 'Account age 7-30 days';
    } else if (ageDays < 90) {
      value = 10;
      reason = 'Account age 30-90 days';
    } else {
      value = TRUST_FACTORS.ACCOUNT_AGE.maxWeight;
      reason = 'Established account (> 90 days)';
    }

    return {
      name: TRUST_FACTORS.ACCOUNT_AGE.name,
      weight: TRUST_FACTORS.ACCOUNT_AGE.maxWeight,
      value,
      reason,
    };
  }

  private calculatePaymentFactor(context: UserContext): TrustFactor {
    let value = 0;
    const reasons: string[] = [];

    if (context.hasPaymentMethod) {
      value += 5;
      reasons.push('Has payment method');
    }

    if (context.totalSpent > 0) {
      if (context.totalSpent >= 100) {
        value += 10;
        reasons.push('Significant spending history');
      } else if (context.totalSpent >= 20) {
        value += 5;
        reasons.push('Moderate spending');
      } else {
        value += 2;
        reasons.push('Some purchases made');
      }
    }

    if (context.subscriptionTier !== 'FREE') {
      value += 3;
      reasons.push(`Active ${context.subscriptionTier} subscription`);
    }

    value = Math.min(value, TRUST_FACTORS.PAYMENT_HISTORY.maxWeight);

    return {
      name: TRUST_FACTORS.PAYMENT_HISTORY.name,
      weight: TRUST_FACTORS.PAYMENT_HISTORY.maxWeight,
      value,
      reason: reasons.length > 0 ? reasons.join('; ') : 'No payment history',
    };
  }

  private calculateBehaviorFactor(context: UserContext): TrustFactor {
    let value = 0;
    const reasons: string[] = [];

    // Conversation activity
    if (context.conversationCount > 100) {
      value += 5;
      reasons.push('Active user');
    } else if (context.conversationCount > 10) {
      value += 2;
      reasons.push('Regular user');
    }

    // Message count as engagement indicator
    if (context.messageCount > 1000) {
      value += 5;
      reasons.push('High engagement');
    } else if (context.messageCount > 100) {
      value += 2;
      reasons.push('Good engagement');
    }

    // Penalty for reports
    if (context.reportCount > 0) {
      value -= context.reportCount * 2;
      reasons.push(`${context.reportCount} reports received`);
    }

    value = Math.max(-15, Math.min(value, TRUST_FACTORS.BEHAVIOR_CONSISTENCY.maxWeight));

    return {
      name: TRUST_FACTORS.BEHAVIOR_CONSISTENCY.name,
      weight: TRUST_FACTORS.BEHAVIOR_CONSISTENCY.maxWeight,
      value,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Normal behavior',
    };
  }

  private calculateViolationFactor(context: UserContext): TrustFactor {
    if (context.violationCount === 0) {
      return {
        name: TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.name,
        weight: TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.maxWeight,
        value: 0,
        reason: 'No violations',
      };
    }

    // Exponential penalty for violations
    const penalty = Math.min(
      Math.abs(TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.maxWeight),
      context.violationCount * 3
    );

    return {
      name: TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.name,
      weight: TRUST_FACTORS.RATE_LIMIT_VIOLATIONS.maxWeight,
      value: -penalty,
      reason: `${context.violationCount} rate limit violations`,
    };
  }

  private scoreToTier(score: number): TrustTier {
    if (score >= 80) return 'VERIFIED';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'UNTRUSTED';
  }

  private async storeTrustScore(score: TrustScore): Promise<void> {
    const key = `${this.keyPrefix}:score:${score.userId}`;
    await this.redis.setex(key, TRUST_SCORE_TTL, JSON.stringify(score));
  }

  private parseEventCounts(data: Record<string, string>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = parseInt(value, 10) || 0;
    }
    return result;
  }
}
