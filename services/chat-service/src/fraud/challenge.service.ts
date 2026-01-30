/**
 * Challenge-Response Service
 *
 * Implements multiple challenge types:
 * - CAPTCHA integration
 * - Proof-of-Work challenges
 * - Invisible challenges (honeypots, timing)
 * - Progressive difficulty scaling
 */

import type { Redis } from 'ioredis';
import crypto from 'crypto';
import type {
  Challenge,
  ChallengeResult,
  ChallengeType,
  ProofOfWorkChallenge,
  ProofOfWorkSolution,
  TrustTier,
} from '../types/fraud.types.js';

// Challenge configuration
const CHALLENGE_TTL = 300; // 5 minutes
const POW_DIFFICULTY_BASE = 16; // Base bits of leading zeros

// Difficulty scaling by trust tier
const DIFFICULTY_MULTIPLIERS: Record<TrustTier, number> = {
  UNTRUSTED: 2.0,
  LOW: 1.5,
  MEDIUM: 1.0,
  HIGH: 0.5,
  VERIFIED: 0,
};

export interface ChallengeDecision {
  required: boolean;
  type: ChallengeType | null;
  difficulty: number;
  reason: string;
}

export interface HoneypotConfig {
  fieldName: string;
  expectedValue: string;
  minSubmitTime: number; // Minimum ms between form load and submit
}

export class ChallengeService {
  private redis: Redis;
  private keyPrefix: string;
  private captchaSecret: string | null;

  constructor(redis: Redis, keyPrefix = 'bostonia:challenge', captchaSecret?: string) {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
    this.captchaSecret = captchaSecret || null;
  }

  // ===========================================================================
  // CHALLENGE DECISION ENGINE
  // ===========================================================================

  /**
   * Decide if a challenge is needed based on context
   */
  async shouldChallenge(
    userId: string | null,
    ipAddress: string,
    trustTier: TrustTier,
    endpoint: string,
    failedAttempts: number
  ): Promise<ChallengeDecision> {
    // Check for recent failed challenges
    const recentFailures = await this.getRecentFailures(userId || ipAddress);

    // Check for suspicious patterns
    const suspicionScore = await this.calculateSuspicionScore(userId, ipAddress);

    // Progressive challenge based on failures and suspicion
    if (recentFailures >= 5 || suspicionScore >= 0.8) {
      return {
        required: true,
        type: 'CAPTCHA',
        difficulty: 10,
        reason: 'High failure count or suspicion score',
      };
    }

    if (recentFailures >= 3 || suspicionScore >= 0.6) {
      return {
        required: true,
        type: 'PROOF_OF_WORK',
        difficulty: 8,
        reason: 'Multiple failures or elevated suspicion',
      };
    }

    // Trust-tier based decisions
    const diffMultiplier = DIFFICULTY_MULTIPLIERS[trustTier];

    if (trustTier === 'UNTRUSTED') {
      return {
        required: true,
        type: 'PROOF_OF_WORK',
        difficulty: Math.ceil(5 * diffMultiplier),
        reason: 'Untrusted account',
      };
    }

    if (trustTier === 'LOW') {
      // Use invisible challenges first
      return {
        required: true,
        type: 'HONEYPOT',
        difficulty: 1,
        reason: 'Low trust score',
      };
    }

    // Endpoint-specific challenges
    if (this.isSensitiveEndpoint(endpoint) && trustTier === 'MEDIUM') {
      return {
        required: true,
        type: 'TIMING',
        difficulty: 1,
        reason: 'Sensitive operation requires verification',
      };
    }

    return {
      required: false,
      type: null,
      difficulty: 0,
      reason: '',
    };
  }

  // ===========================================================================
  // PROOF OF WORK CHALLENGES
  // ===========================================================================

  /**
   * Generate a proof-of-work challenge
   */
  async generatePowChallenge(
    userId: string | null,
    ipAddress: string,
    difficulty: number
  ): Promise<Challenge> {
    // Scale difficulty (bits of leading zeros required)
    const scaledDifficulty = Math.min(24, Math.max(12, POW_DIFFICULTY_BASE + difficulty));

    const prefix = crypto.randomBytes(16).toString('hex');
    const challengeId = crypto.randomUUID();

    const powChallenge: ProofOfWorkChallenge = {
      prefix,
      difficulty: scaledDifficulty,
      algorithm: 'sha256',
      maxIterations: 10000000,
      timeoutMs: 30000,
    };

    const challenge: Challenge = {
      id: challengeId,
      type: 'PROOF_OF_WORK',
      difficulty,
      payload: powChallenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL * 1000),
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };

    // Store challenge
    await this.storeChallenge(challenge, userId || ipAddress);

    return challenge;
  }

  /**
   * Verify proof-of-work solution
   */
  async verifyPowSolution(
    challengeId: string,
    identifier: string,
    solution: ProofOfWorkSolution
  ): Promise<ChallengeResult> {
    const challenge = await this.getChallenge(challengeId, identifier);

    if (!challenge) {
      return {
        challengeId,
        success: false,
        timeTaken: 0,
        response: null,
        metadata: { error: 'Challenge not found or expired' },
      };
    }

    if (challenge.type !== 'PROOF_OF_WORK') {
      return {
        challengeId,
        success: false,
        timeTaken: 0,
        response: null,
        metadata: { error: 'Invalid challenge type' },
      };
    }

    // Increment attempt counter
    challenge.attempts++;
    await this.storeChallenge(challenge, identifier);

    if (challenge.attempts > challenge.maxAttempts) {
      await this.recordFailure(identifier);
      return {
        challengeId,
        success: false,
        timeTaken: solution.timeTaken,
        response: null,
        metadata: { error: 'Max attempts exceeded' },
      };
    }

    const powConfig = challenge.payload as ProofOfWorkChallenge;

    // Verify the hash
    const data = `${powConfig.prefix}${solution.nonce}`;
    const hash = crypto.createHash(powConfig.algorithm).update(data).digest('hex');

    // Check leading zeros
    const requiredZeros = Math.floor(powConfig.difficulty / 4);
    const leadingZeros = hash.match(/^0*/)?.[0].length || 0;

    if (leadingZeros < requiredZeros || hash !== solution.hash) {
      await this.recordFailure(identifier);
      return {
        challengeId,
        success: false,
        timeTaken: solution.timeTaken,
        response: solution,
        metadata: { error: 'Invalid solution', expectedZeros: requiredZeros },
      };
    }

    // Success - delete challenge
    await this.deleteChallenge(challengeId, identifier);

    return {
      challengeId,
      success: true,
      timeTaken: solution.timeTaken,
      response: solution,
      metadata: { iterations: solution.iterations },
    };
  }

  // ===========================================================================
  // CAPTCHA INTEGRATION
  // ===========================================================================

  /**
   * Generate CAPTCHA challenge (returns data needed for frontend)
   */
  async generateCaptchaChallenge(
    userId: string | null,
    ipAddress: string
  ): Promise<Challenge> {
    const challengeId = crypto.randomUUID();

    const challenge: Challenge = {
      id: challengeId,
      type: 'CAPTCHA',
      difficulty: 1,
      payload: {
        // Frontend will use this to render appropriate CAPTCHA
        provider: 'recaptcha', // or 'hcaptcha', 'turnstile'
        siteKey: process.env.RECAPTCHA_SITE_KEY || '',
      },
      expiresAt: new Date(Date.now() + CHALLENGE_TTL * 1000),
      attempts: 0,
      maxAttempts: 5,
      createdAt: new Date(),
    };

    await this.storeChallenge(challenge, userId || ipAddress);

    return challenge;
  }

  /**
   * Verify CAPTCHA response
   */
  async verifyCaptchaResponse(
    challengeId: string,
    identifier: string,
    captchaToken: string
  ): Promise<ChallengeResult> {
    const challenge = await this.getChallenge(challengeId, identifier);

    if (!challenge || challenge.type !== 'CAPTCHA') {
      return {
        challengeId,
        success: false,
        timeTaken: 0,
        response: null,
        metadata: { error: 'Challenge not found or invalid type' },
      };
    }

    // Verify with provider
    const verificationResult = await this.verifyWithCaptchaProvider(captchaToken);

    if (!verificationResult.success) {
      challenge.attempts++;
      await this.storeChallenge(challenge, identifier);
      await this.recordFailure(identifier);

      return {
        challengeId,
        success: false,
        timeTaken: 0,
        response: null,
        metadata: { error: 'CAPTCHA verification failed', ...verificationResult },
      };
    }

    await this.deleteChallenge(challengeId, identifier);

    return {
      challengeId,
      success: true,
      timeTaken: 0,
      response: null,
      metadata: { score: verificationResult.score },
    };
  }

  private async verifyWithCaptchaProvider(
    token: string
  ): Promise<{ success: boolean; score?: number }> {
    if (!this.captchaSecret) {
      // Development mode - accept all
      return { success: true, score: 1.0 };
    }

    try {
      const response = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${this.captchaSecret}&response=${token}`,
        }
      );

      const data = (await response.json()) as {
        success: boolean;
        score?: number;
        'error-codes'?: string[];
      };

      return {
        success: data.success && (!data.score || data.score >= 0.5),
        score: data.score,
      };
    } catch {
      return { success: false };
    }
  }

  // ===========================================================================
  // INVISIBLE CHALLENGES
  // ===========================================================================

  /**
   * Generate honeypot challenge (invisible field)
   */
  generateHoneypotChallenge(): HoneypotConfig {
    return {
      fieldName: 'website_url', // Looks like a legitimate field
      expectedValue: '', // Should remain empty
      minSubmitTime: 1500, // Must take at least 1.5s to submit
    };
  }

  /**
   * Verify honeypot challenge
   */
  verifyHoneypot(
    honeypotValue: string | undefined,
    formLoadTime: number,
    submitTime: number
  ): { success: boolean; reason: string | null } {
    // Honeypot should be empty
    if (honeypotValue && honeypotValue.length > 0) {
      return { success: false, reason: 'Honeypot field filled' };
    }

    // Check timing (bots typically submit too fast)
    const elapsed = submitTime - formLoadTime;
    if (elapsed < 1500) {
      return { success: false, reason: 'Form submitted too quickly' };
    }

    return { success: true, reason: null };
  }

  /**
   * Generate timing challenge
   */
  async generateTimingChallenge(
    identifier: string
  ): Promise<{ challengeId: string; minDelay: number; maxDelay: number }> {
    const challengeId = crypto.randomUUID();
    const minDelay = 2000; // 2 seconds
    const maxDelay = 30000; // 30 seconds

    const challenge: Challenge = {
      id: challengeId,
      type: 'TIMING',
      difficulty: 1,
      payload: { minDelay, maxDelay, startTime: Date.now() },
      expiresAt: new Date(Date.now() + maxDelay + 5000),
      attempts: 0,
      maxAttempts: 1,
      createdAt: new Date(),
    };

    await this.storeChallenge(challenge, identifier);

    return { challengeId, minDelay, maxDelay };
  }

  /**
   * Verify timing challenge
   */
  async verifyTimingChallenge(
    challengeId: string,
    identifier: string
  ): Promise<{ success: boolean; reason: string | null }> {
    const challenge = await this.getChallenge(challengeId, identifier);

    if (!challenge || challenge.type !== 'TIMING') {
      return { success: false, reason: 'Challenge not found' };
    }

    const payload = challenge.payload as { minDelay: number; maxDelay: number; startTime: number };
    const elapsed = Date.now() - payload.startTime;

    if (elapsed < payload.minDelay) {
      await this.recordFailure(identifier);
      return { success: false, reason: 'Response too fast' };
    }

    if (elapsed > payload.maxDelay) {
      return { success: false, reason: 'Challenge expired' };
    }

    await this.deleteChallenge(challengeId, identifier);
    return { success: true, reason: null };
  }

  // ===========================================================================
  // PROGRESSIVE DIFFICULTY
  // ===========================================================================

  /**
   * Calculate progressive difficulty based on failure history
   */
  async calculateProgressiveDifficulty(identifier: string): Promise<number> {
    const failures = await this.getRecentFailures(identifier);

    if (failures === 0) return 1;
    if (failures <= 2) return 3;
    if (failures <= 5) return 6;
    if (failures <= 10) return 8;
    return 10;
  }

  /**
   * Get escalation chain for repeated failures
   */
  getEscalationChain(failures: number): ChallengeType[] {
    if (failures === 0) return [];
    if (failures <= 2) return ['HONEYPOT', 'TIMING'];
    if (failures <= 5) return ['PROOF_OF_WORK'];
    return ['CAPTCHA', 'MFA'];
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async storeChallenge(challenge: Challenge, identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:${identifier}:${challenge.id}`;
    const ttl = Math.ceil((challenge.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.setex(key, Math.max(ttl, 1), JSON.stringify(challenge));
  }

  private async getChallenge(
    challengeId: string,
    identifier: string
  ): Promise<Challenge | null> {
    const key = `${this.keyPrefix}:${identifier}:${challengeId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    try {
      const challenge = JSON.parse(data) as Challenge;
      challenge.expiresAt = new Date(challenge.expiresAt);
      challenge.createdAt = new Date(challenge.createdAt);
      return challenge;
    } catch {
      return null;
    }
  }

  private async deleteChallenge(challengeId: string, identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:${identifier}:${challengeId}`;
    await this.redis.del(key);
  }

  private async recordFailure(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:failures:${identifier}`;
    await this.redis.incr(key);
    await this.redis.expire(key, 3600); // 1 hour
  }

  private async getRecentFailures(identifier: string): Promise<number> {
    const key = `${this.keyPrefix}:failures:${identifier}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  private async calculateSuspicionScore(
    userId: string | null,
    ipAddress: string
  ): Promise<number> {
    // This would integrate with the fraud detection system
    // For now, return a simple score based on failures
    const identifier = userId || ipAddress;
    const failures = await this.getRecentFailures(identifier);
    return Math.min(1.0, failures * 0.15);
  }

  private isSensitiveEndpoint(endpoint: string): boolean {
    const sensitive = [
      '/api/auth/',
      '/api/payments/',
      '/api/subscription/',
      '/api/users/',
    ];
    return sensitive.some((s) => endpoint.startsWith(s));
  }
}
