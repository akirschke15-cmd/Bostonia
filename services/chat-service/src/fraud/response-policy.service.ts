/**
 * Response Policy Service
 *
 * Implements response manipulation strategies:
 * - Delayed responses for suspicious users
 * - Degraded service for suspected bots
 * - Shadow banning (accept but don't process)
 * - Blocking with appropriate errors
 */

import type { Redis } from 'ioredis';
import type {
  ResponsePolicy,
  ResponsePolicyType,
  ResponsePolicyParams,
  TrustTier,
  RiskLevel,
} from '../types/fraud.types.js';

// Default policy parameters
const DEFAULT_DELAY_PARAMS: ResponsePolicyParams = {
  minDelay: 500,
  maxDelay: 3000,
};

const DEFAULT_DEGRADED_PARAMS: ResponsePolicyParams = {
  featureRestrictions: ['media_upload', 'long_messages', 'rapid_messages'],
  maxMessageLength: 500,
  maxMessagesPerHour: 20,
};

const DEFAULT_SHADOW_BAN_PARAMS: ResponsePolicyParams = {
  affectsEarnings: true,
  affectsAnalytics: true,
};

const DEFAULT_BLOCK_PARAMS: ResponsePolicyParams = {
  errorCode: 'ACCOUNT_RESTRICTED',
  errorMessage: 'Your account has been temporarily restricted. Please contact support.',
};

// Policy TTLs
const POLICY_TTL = 86400 * 7; // 7 days default

export class ResponsePolicyService {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix = 'bostonia:policy') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // POLICY MANAGEMENT
  // ===========================================================================

  /**
   * Get current policy for a user
   */
  async getPolicy(userId: string): Promise<ResponsePolicy | null> {
    const key = `${this.keyPrefix}:${userId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const policy = JSON.parse(data) as ResponsePolicy;
      policy.appliedAt = new Date(policy.appliedAt);
      if (policy.expiresAt) {
        policy.expiresAt = new Date(policy.expiresAt);
      }
      return policy;
    } catch {
      return null;
    }
  }

  /**
   * Apply a policy to a user
   */
  async applyPolicy(
    userId: string,
    policyType: ResponsePolicyType,
    reason: string,
    duration: number | null = POLICY_TTL,
    params?: Partial<ResponsePolicyParams>
  ): Promise<ResponsePolicy> {
    const defaultParams = this.getDefaultParams(policyType);
    const mergedParams: ResponsePolicyParams = { ...defaultParams, ...params };

    const policy: ResponsePolicy = {
      userId,
      policy: policyType,
      reason,
      appliedAt: new Date(),
      expiresAt: duration ? new Date(Date.now() + duration * 1000) : null,
      parameters: mergedParams,
    };

    const key = `${this.keyPrefix}:${userId}`;
    if (duration) {
      await this.redis.setex(key, duration, JSON.stringify(policy));
    } else {
      await this.redis.set(key, JSON.stringify(policy));
    }

    // Log policy application
    await this.logPolicyChange(userId, policyType, reason);

    return policy;
  }

  /**
   * Remove policy from user
   */
  async removePolicy(userId: string, reason: string): Promise<void> {
    const key = `${this.keyPrefix}:${userId}`;
    await this.redis.del(key);
    await this.logPolicyChange(userId, 'NORMAL', `Policy removed: ${reason}`);
  }

  /**
   * Escalate policy based on behavior
   */
  async escalatePolicy(userId: string, reason: string): Promise<ResponsePolicy> {
    const currentPolicy = await this.getPolicy(userId);

    let newPolicyType: ResponsePolicyType;

    if (!currentPolicy || currentPolicy.policy === 'NORMAL') {
      newPolicyType = 'DELAYED';
    } else if (currentPolicy.policy === 'DELAYED') {
      newPolicyType = 'DEGRADED';
    } else if (currentPolicy.policy === 'DEGRADED') {
      newPolicyType = 'SHADOW_BANNED';
    } else {
      newPolicyType = 'BLOCKED';
    }

    return this.applyPolicy(userId, newPolicyType, `Escalated: ${reason}`);
  }

  /**
   * Determine appropriate policy based on risk assessment
   */
  determinePolicyFromRisk(
    trustTier: TrustTier,
    riskLevel: RiskLevel,
    violationCount: number
  ): { policyType: ResponsePolicyType; reason: string; duration: number } {
    // Critical risk always blocks
    if (riskLevel === 'CRITICAL') {
      return {
        policyType: 'BLOCKED',
        reason: 'Critical risk level detected',
        duration: 86400, // 24 hours
      };
    }

    // High risk handling
    if (riskLevel === 'HIGH') {
      if (violationCount >= 5) {
        return {
          policyType: 'SHADOW_BANNED',
          reason: 'High risk with multiple violations',
          duration: 86400 * 3, // 3 days
        };
      }
      return {
        policyType: 'DEGRADED',
        reason: 'High risk level',
        duration: 3600, // 1 hour
      };
    }

    // Medium risk with untrusted account
    if (riskLevel === 'MEDIUM' && trustTier === 'UNTRUSTED') {
      return {
        policyType: 'DELAYED',
        reason: 'Untrusted account with medium risk',
        duration: 1800, // 30 minutes
      };
    }

    // Default to normal
    return {
      policyType: 'NORMAL',
      reason: 'Normal operation',
      duration: 0,
    };
  }

  // ===========================================================================
  // POLICY EXECUTION
  // ===========================================================================

  /**
   * Execute delay policy - returns delay in milliseconds
   */
  calculateDelay(policy: ResponsePolicy): number {
    if (policy.policy !== 'DELAYED') return 0;

    const { minDelay = 500, maxDelay = 3000 } = policy.parameters;
    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }

  /**
   * Apply delay (for use in request handling)
   */
  async applyDelay(userId: string): Promise<number> {
    const policy = await this.getPolicy(userId);
    if (!policy || policy.policy !== 'DELAYED') return 0;

    const delay = this.calculateDelay(policy);

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return delay;
  }

  /**
   * Check if feature is restricted
   */
  async isFeatureRestricted(userId: string, feature: string): Promise<boolean> {
    const policy = await this.getPolicy(userId);

    if (!policy || policy.policy === 'NORMAL') return false;
    if (policy.policy === 'BLOCKED') return true;
    if (policy.policy === 'SHADOW_BANNED') return false; // Shadow ban allows features but doesn't count

    if (policy.policy === 'DEGRADED') {
      const restrictions = policy.parameters.featureRestrictions || [];
      return restrictions.includes(feature);
    }

    return false;
  }

  /**
   * Get message length limit for user
   */
  async getMessageLengthLimit(userId: string, defaultLimit: number): Promise<number> {
    const policy = await this.getPolicy(userId);

    if (!policy || policy.policy === 'NORMAL') return defaultLimit;

    if (policy.policy === 'DEGRADED' && policy.parameters.maxMessageLength) {
      return policy.parameters.maxMessageLength;
    }

    return defaultLimit;
  }

  /**
   * Check if user is shadow banned
   */
  async isShadowBanned(userId: string): Promise<boolean> {
    const policy = await this.getPolicy(userId);
    return policy?.policy === 'SHADOW_BANNED';
  }

  /**
   * Check if action should be counted (for analytics/earnings)
   */
  async shouldCountAction(userId: string): Promise<boolean> {
    const policy = await this.getPolicy(userId);

    if (!policy) return true;

    if (policy.policy === 'SHADOW_BANNED') {
      return !policy.parameters.affectsEarnings;
    }

    return policy.policy !== 'BLOCKED';
  }

  /**
   * Check if user is blocked
   */
  async isBlocked(userId: string): Promise<{ blocked: boolean; message: string | null }> {
    const policy = await this.getPolicy(userId);

    if (!policy || policy.policy !== 'BLOCKED') {
      return { blocked: false, message: null };
    }

    return {
      blocked: true,
      message: policy.parameters.errorMessage || 'Access denied',
    };
  }

  // ===========================================================================
  // SHADOW BAN SPECIFIC
  // ===========================================================================

  /**
   * Process message under shadow ban (accept but don't really process)
   */
  async processShadowBannedMessage(
    userId: string,
    messageId: string,
    content: string
  ): Promise<{
    fakeResponse: boolean;
    shouldNotify: boolean;
  }> {
    const policy = await this.getPolicy(userId);

    if (!policy || policy.policy !== 'SHADOW_BANNED') {
      return { fakeResponse: false, shouldNotify: false };
    }

    // Log shadow banned message for review
    await this.redis.lpush(
      `${this.keyPrefix}:shadowban:messages:${userId}`,
      JSON.stringify({
        messageId,
        content: content.substring(0, 200), // Truncate for storage
        timestamp: Date.now(),
      })
    );
    await this.redis.ltrim(`${this.keyPrefix}:shadowban:messages:${userId}`, 0, 99);
    await this.redis.expire(`${this.keyPrefix}:shadowban:messages:${userId}`, 86400 * 7);

    return {
      fakeResponse: true,
      shouldNotify: false, // Don't notify creator
    };
  }

  /**
   * Get shadow banned messages for review
   */
  async getShadowBannedMessages(
    userId: string
  ): Promise<Array<{ messageId: string; content: string; timestamp: number }>> {
    const messages = await this.redis.lrange(
      `${this.keyPrefix}:shadowban:messages:${userId}`,
      0,
      -1
    );

    return messages.map((m) => {
      try {
        return JSON.parse(m);
      } catch {
        return { messageId: '', content: '', timestamp: 0 };
      }
    });
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getDefaultParams(policyType: ResponsePolicyType): ResponsePolicyParams {
    switch (policyType) {
      case 'DELAYED':
        return DEFAULT_DELAY_PARAMS;
      case 'DEGRADED':
        return DEFAULT_DEGRADED_PARAMS;
      case 'SHADOW_BANNED':
        return DEFAULT_SHADOW_BAN_PARAMS;
      case 'BLOCKED':
        return DEFAULT_BLOCK_PARAMS;
      default:
        return {};
    }
  }

  private async logPolicyChange(
    userId: string,
    policy: ResponsePolicyType,
    reason: string
  ): Promise<void> {
    await this.redis.lpush(
      `${this.keyPrefix}:history:${userId}`,
      JSON.stringify({
        policy,
        reason,
        timestamp: Date.now(),
      })
    );
    await this.redis.ltrim(`${this.keyPrefix}:history:${userId}`, 0, 99);
    await this.redis.expire(`${this.keyPrefix}:history:${userId}`, 86400 * 30);
  }

  /**
   * Get policy history for a user
   */
  async getPolicyHistory(
    userId: string
  ): Promise<Array<{ policy: ResponsePolicyType; reason: string; timestamp: number }>> {
    const history = await this.redis.lrange(`${this.keyPrefix}:history:${userId}`, 0, -1);

    return history.map((h) => {
      try {
        return JSON.parse(h);
      } catch {
        return { policy: 'NORMAL', reason: '', timestamp: 0 };
      }
    });
  }
}
