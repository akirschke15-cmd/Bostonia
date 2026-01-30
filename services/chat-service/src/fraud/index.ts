/**
 * Fraud Protection Module
 *
 * Main orchestration service that coordinates all fraud detection
 * and prevention components for the chat service.
 */

import type { Redis } from 'ioredis';
import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';

import { FingerprintService } from './fingerprint.service.js';
import { TrustScoreService, type UserContext } from './trust-score.service.js';
import { AdaptiveRateLimiterService } from './rate-limiter.service.js';
import { ChallengeService } from './challenge.service.js';
import { WebSocketProtectionService } from './websocket-protection.service.js';
import { PayloadAnalyzerService } from './payload-analyzer.service.js';
import { ResponsePolicyService } from './response-policy.service.js';
import { RequestSigningService } from './request-signing.service.js';

import type {
  TrustTier,
  FraudEvent,
  FraudEventType,
  FraudSeverity,
  FraudAction,
  MessageAnalysis,
  RiskLevel,
} from '../types/fraud.types.js';

// Re-export types
export * from '../types/fraud.types.js';

// Re-export services
export { FingerprintService } from './fingerprint.service.js';
export { TrustScoreService } from './trust-score.service.js';
export { AdaptiveRateLimiterService } from './rate-limiter.service.js';
export { ChallengeService } from './challenge.service.js';
export { WebSocketProtectionService } from './websocket-protection.service.js';
export { PayloadAnalyzerService } from './payload-analyzer.service.js';
export { ResponsePolicyService } from './response-policy.service.js';
export { RequestSigningService } from './request-signing.service.js';

// Fraud detection thresholds
const THRESHOLDS = {
  TRUST_SCORE_CHALLENGE: 40,
  SUSPICION_SCORE_ALERT: 0.7,
  RATE_LIMIT_VIOLATIONS_ESCALATE: 5,
  SPAM_SCORE_FLAG: 0.6,
  AUTOMATION_SCORE_FLAG: 0.7,
};

export interface FraudProtectionConfig {
  redis: Redis;
  enableFingerprinting: boolean;
  enableTrustScoring: boolean;
  enableAdaptiveRateLimiting: boolean;
  enableChallenges: boolean;
  enablePayloadAnalysis: boolean;
  enableResponsePolicies: boolean;
  enableRequestSigning: boolean;
  captchaSecret?: string;
  logger?: {
    info: (obj: Record<string, unknown>, msg: string) => void;
    warn: (obj: Record<string, unknown>, msg: string) => void;
    error: (obj: Record<string, unknown>, msg: string) => void;
  };
}

export interface RequestContext {
  userId: string | null;
  ipAddress: string;
  deviceId: string | null;
  sessionId: string | null;
  endpoint: string;
  method: string;
  userAgent: string;
}

export interface ProtectionResult {
  allowed: boolean;
  reason: string | null;
  actions: FraudAction[];
  trustTier: TrustTier;
  riskLevel: RiskLevel;
  delay: number;
  headers: Record<string, string>;
  challenge: {
    required: boolean;
    type: string | null;
    challengeId: string | null;
  } | null;
}

export class FraudProtectionService {
  private redis: Redis;
  private config: FraudProtectionConfig;
  private logger: FraudProtectionConfig['logger'];

  // Sub-services
  public fingerprint: FingerprintService;
  public trustScore: TrustScoreService;
  public rateLimiter: AdaptiveRateLimiterService;
  public challenge: ChallengeService;
  public websocket: WebSocketProtectionService;
  public payload: PayloadAnalyzerService;
  public responsePolicy: ResponsePolicyService;
  public requestSigning: RequestSigningService;

  constructor(config: FraudProtectionConfig) {
    this.redis = config.redis;
    this.config = config;
    this.logger = config.logger;

    // Initialize sub-services
    this.fingerprint = new FingerprintService(this.redis);
    this.trustScore = new TrustScoreService(this.redis);
    this.rateLimiter = new AdaptiveRateLimiterService(this.redis);
    this.challenge = new ChallengeService(this.redis, undefined, config.captchaSecret);
    this.websocket = new WebSocketProtectionService(this.redis);
    this.payload = new PayloadAnalyzerService(this.redis);
    this.responsePolicy = new ResponsePolicyService(this.redis);
    this.requestSigning = new RequestSigningService(this.redis);
  }

  // ===========================================================================
  // MAIN PROTECTION FLOW
  // ===========================================================================

  /**
   * Main entry point for request protection
   */
  async protectRequest(
    req: Request,
    context: RequestContext
  ): Promise<ProtectionResult> {
    const actions: FraudAction[] = [];
    let trustTier: TrustTier = 'MEDIUM';
    let riskLevel: RiskLevel = 'LOW';
    let delay = 0;
    const headers: Record<string, string> = {};

    // 1. Extract and validate fingerprint
    if (this.config.enableFingerprinting) {
      const fingerprint = this.fingerprint.extractRequestFingerprint(req);
      const automationIndicators = this.fingerprint.detectAutomation(fingerprint);

      if (automationIndicators.length > 0) {
        const automationScore = automationIndicators.reduce(
          (sum, ind) => sum + ind.weight * ind.confidence,
          0
        ) / automationIndicators.length;

        if (automationScore > THRESHOLDS.AUTOMATION_SCORE_FLAG) {
          actions.push('CHALLENGE');
          riskLevel = 'HIGH';

          this.logger?.warn(
            { userId: context.userId, indicators: automationIndicators },
            'Automation detected in request'
          );
        }
      }

      // Validate session binding if we have a session
      if (context.sessionId && context.deviceId) {
        const bindingResult = await this.fingerprint.validateSessionBinding(
          context.sessionId,
          context.deviceId,
          context.ipAddress,
          fingerprint
        );

        if (!bindingResult.isValid) {
          actions.push('CHALLENGE');
          riskLevel = this.escalateRisk(riskLevel, 'MEDIUM');

          this.logger?.warn(
            { userId: context.userId, reason: bindingResult.reason },
            'Session binding validation failed'
          );
        }
      }
    }

    // 2. Get/calculate trust score
    if (this.config.enableTrustScoring && context.userId) {
      const score = await this.trustScore.getTrustScore(context.userId);
      if (score) {
        trustTier = score.tier;

        if (score.score < THRESHOLDS.TRUST_SCORE_CHALLENGE) {
          actions.push('CHALLENGE');
        }
      }
    } else {
      // Anonymous users get lowest trust
      trustTier = 'LOW';
    }

    // 3. Check rate limits
    if (this.config.enableAdaptiveRateLimiting) {
      const rateLimitResult = await this.rateLimiter.checkRateLimit({
        userId: context.userId,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint,
        trustTier,
        deviceId: context.deviceId,
      });

      // Add rate limit headers
      Object.assign(headers, this.rateLimiter.getRateLimitHeaders(rateLimitResult));

      if (!rateLimitResult.allowed) {
        await this.recordViolation(context.userId, context.ipAddress, 'rate_limit');

        return {
          allowed: false,
          reason: rateLimitResult.reason,
          actions: ['RATE_LIMIT'],
          trustTier,
          riskLevel: 'HIGH',
          delay: 0,
          headers,
          challenge: null,
        };
      }
    }

    // 4. Check response policy
    if (this.config.enableResponsePolicies && context.userId) {
      const blockCheck = await this.responsePolicy.isBlocked(context.userId);
      if (blockCheck.blocked) {
        return {
          allowed: false,
          reason: blockCheck.message,
          actions: ['TEMPORARY_BAN'],
          trustTier,
          riskLevel: 'CRITICAL',
          delay: 0,
          headers,
          challenge: null,
        };
      }

      // Apply delay if policy requires
      delay = await this.responsePolicy.applyDelay(context.userId);
    }

    // 5. Check if challenge is required
    let challengeInfo: ProtectionResult['challenge'] = null;

    if (this.config.enableChallenges && actions.includes('CHALLENGE')) {
      const decision = await this.challenge.shouldChallenge(
        context.userId,
        context.ipAddress,
        trustTier,
        context.endpoint,
        0
      );

      if (decision.required && decision.type) {
        let challengeId: string | null = null;

        if (decision.type === 'PROOF_OF_WORK') {
          const powChallenge = await this.challenge.generatePowChallenge(
            context.userId,
            context.ipAddress,
            decision.difficulty
          );
          challengeId = powChallenge.id;
        } else if (decision.type === 'CAPTCHA') {
          const captchaChallenge = await this.challenge.generateCaptchaChallenge(
            context.userId,
            context.ipAddress
          );
          challengeId = captchaChallenge.id;
        }

        challengeInfo = {
          required: true,
          type: decision.type,
          challengeId,
        };
      }
    }

    // Determine if request should proceed
    const shouldBlock = riskLevel === 'CRITICAL' ||
      (challengeInfo?.required && !this.canBypassChallenge(context.endpoint));

    return {
      allowed: !shouldBlock,
      reason: shouldBlock ? 'Security verification required' : null,
      actions,
      trustTier,
      riskLevel,
      delay,
      headers,
      challenge: challengeInfo,
    };
  }

  /**
   * Protect and analyze message content
   */
  async protectMessage(
    messageId: string,
    userId: string,
    content: string,
    metadata?: {
      typingDuration?: number;
      editCount?: number;
      pasteEvents?: number;
    }
  ): Promise<{
    allowed: boolean;
    analysis: MessageAnalysis;
    policyApplied: string | null;
    shouldCountForEarnings: boolean;
  }> {
    // Analyze payload
    const analysis = await this.payload.analyzeMessage(messageId, userId, content, metadata);

    // Check response policy
    const isShadowBanned = await this.responsePolicy.isShadowBanned(userId);
    const shouldCount = await this.responsePolicy.shouldCountAction(userId);

    // Determine if message should be blocked
    const shouldBlock = analysis.riskLevel === 'CRITICAL' ||
      (analysis.spamScore >= THRESHOLDS.SPAM_SCORE_FLAG && analysis.riskLevel === 'HIGH');

    // Auto-apply policy for highly suspicious content
    if (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'CRITICAL') {
      const trustScore = await this.trustScore.getTrustScore(userId);
      const policyDecision = this.responsePolicy.determinePolicyFromRisk(
        trustScore?.tier || 'LOW',
        analysis.riskLevel,
        0
      );

      if (policyDecision.policyType !== 'NORMAL') {
        await this.responsePolicy.applyPolicy(
          userId,
          policyDecision.policyType,
          policyDecision.reason,
          policyDecision.duration
        );
      }
    }

    // Record fraud event if warranted
    if (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'CRITICAL') {
      await this.recordFraudEvent({
        eventType: analysis.contentType === 'SPAM' ? 'API_ABUSE' : 'BOT_DETECTION',
        severity: analysis.riskLevel === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        userId,
        sessionId: null,
        ipAddress: '',
        deviceFingerprint: null,
        details: {
          messageId,
          analysis: {
            contentType: analysis.contentType,
            spamScore: analysis.spamScore,
            automationScore: analysis.automationScore,
            flags: analysis.flags,
          },
        },
        action: shouldBlock ? 'SHADOW_BAN' : 'LOG_ONLY',
      });
    }

    return {
      allowed: !shouldBlock,
      analysis,
      policyApplied: isShadowBanned ? 'SHADOW_BANNED' : null,
      shouldCountForEarnings: shouldCount,
    };
  }

  // ===========================================================================
  // WEBSOCKET PROTECTION
  // ===========================================================================

  /**
   * Handle WebSocket connection with protection
   */
  async protectWebSocketConnection(
    socket: Socket,
    userId: string,
    deviceId: string,
    ipAddress: string
  ): Promise<{ allowed: boolean; reason: string | null }> {
    // Get trust tier
    const trustScore = await this.trustScore.getTrustScore(userId);
    const trustTier = trustScore?.tier || 'LOW';

    // Check connection
    const result = await this.websocket.onConnection(
      socket,
      userId,
      deviceId,
      ipAddress,
      trustTier
    );

    if (!result.allowed) {
      this.logger?.warn(
        { userId, deviceId, reason: result.reason },
        'WebSocket connection denied'
      );
    }

    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }

  /**
   * Protect WebSocket message
   */
  async protectWebSocketMessage(
    socketId: string,
    messageSize: number
  ): Promise<{ allowed: boolean; reason: string | null }> {
    const result = await this.websocket.checkMessageRateLimit(socketId, messageSize);

    if (!result.allowed) {
      this.logger?.warn(
        { socketId, reason: result.reason, flags: result.flags },
        'WebSocket message rate limited'
      );
    }

    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }

  // ===========================================================================
  // FRAUD EVENT RECORDING
  // ===========================================================================

  /**
   * Record a fraud event
   */
  async recordFraudEvent(event: Omit<FraudEvent, 'id' | 'timestamp' | 'resolved' | 'resolvedAt' | 'resolvedBy' | 'notes'>): Promise<string> {
    const eventId = crypto.randomUUID();
    const fullEvent: FraudEvent = {
      id: eventId,
      timestamp: new Date(),
      ...event,
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      notes: null,
    };

    // Store event
    const key = `bostonia:fraud:events:${eventId}`;
    await this.redis.setex(key, 86400 * 30, JSON.stringify(fullEvent));

    // Add to user's fraud event list
    if (event.userId) {
      await this.redis.lpush(`bostonia:fraud:user:${event.userId}`, eventId);
      await this.redis.ltrim(`bostonia:fraud:user:${event.userId}`, 0, 99);
    }

    // Add to IP's fraud event list
    await this.redis.lpush(`bostonia:fraud:ip:${event.ipAddress}`, eventId);
    await this.redis.ltrim(`bostonia:fraud:ip:${event.ipAddress}`, 0, 99);

    // Trigger alerts for high severity
    if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
      this.logger?.warn(
        { eventId, eventType: event.eventType, userId: event.userId },
        `High severity fraud event: ${event.eventType}`
      );

      if (event.action === 'NOTIFY_ADMIN') {
        // Would trigger admin notification here
      }
    }

    return eventId;
  }

  /**
   * Get fraud events for a user
   */
  async getUserFraudEvents(userId: string): Promise<FraudEvent[]> {
    const eventIds = await this.redis.lrange(`bostonia:fraud:user:${userId}`, 0, -1);
    const events: FraudEvent[] = [];

    for (const eventId of eventIds) {
      const eventData = await this.redis.get(`bostonia:fraud:events:${eventId}`);
      if (eventData) {
        try {
          const event = JSON.parse(eventData) as FraudEvent;
          event.timestamp = new Date(event.timestamp);
          events.push(event);
        } catch {
          // Skip invalid events
        }
      }
    }

    return events;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async recordViolation(
    userId: string | null,
    ipAddress: string,
    type: string
  ): Promise<void> {
    const key = userId
      ? `bostonia:violations:user:${userId}`
      : `bostonia:violations:ip:${ipAddress}`;

    await this.redis.hincrby(key, type, 1);
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.expire(key, 86400);

    // Check if escalation is needed
    if (userId) {
      const total = await this.redis.hget(key, 'total');
      if (total && parseInt(total, 10) >= THRESHOLDS.RATE_LIMIT_VIOLATIONS_ESCALATE) {
        await this.responsePolicy.escalatePolicy(userId, 'Multiple rate limit violations');
      }
    }
  }

  private escalateRisk(current: RiskLevel, newRisk: RiskLevel): RiskLevel {
    const levels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const currentIndex = levels.indexOf(current);
    const newIndex = levels.indexOf(newRisk);
    return levels[Math.max(currentIndex, newIndex)] || current;
  }

  private canBypassChallenge(endpoint: string): boolean {
    // Some endpoints can proceed even with challenge required
    // (challenge will be served on next request)
    const bypassable = ['/health', '/api/auth/refresh'];
    return bypassable.some((e) => endpoint.startsWith(e));
  }

  /**
   * Calculate user context for trust scoring
   */
  async calculateUserContext(userId: string): Promise<UserContext | null> {
    // This would typically fetch from your database
    // For now, return a stub that services should implement
    return null;
  }
}

// Import crypto for randomUUID
import crypto from 'crypto';
