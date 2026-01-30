import { Redis } from 'ioredis';
import { prisma } from '@bostonia/database';
import { logger } from '../lib/logger.js';

export interface DetectionContext {
  userId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint?: string;
  characterId?: string;
  creatorId?: string;
  action: 'message' | 'conversation_start' | 'rating' | 'favorite';
  metadata?: Record<string, unknown>;
}

export interface RiskSignal {
  name: string;
  score: number; // 0-1
  weight: number;
  details?: Record<string, unknown>;
}

export interface RiskAssessment {
  overallScore: number;
  signals: RiskSignal[];
  action: 'allow' | 'throttle' | 'challenge' | 'block' | 'shadow';
  flags: string[];
}

// Velocity limits (per time window)
const VELOCITY_LIMITS = {
  messages_per_minute: 10,
  messages_per_hour: 100,
  conversations_per_hour: 20,
  conversations_per_day: 100,
  unique_characters_per_hour: 15,
  ratings_per_hour: 30,
};

// Risk thresholds
const RISK_THRESHOLDS = {
  throttle: 0.4,
  challenge: 0.6, // CAPTCHA or email verification
  block: 0.8,
  shadow: 0.7, // Count activity but don't pay creator
};

export class RealtimeDetectionService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async assess(ctx: DetectionContext): Promise<RiskAssessment> {
    const signals: RiskSignal[] = [];
    const flags: string[] = [];

    // Run all checks in parallel
    const [velocitySignals, behaviorSignals, deviceSignals, networkSignals, relationshipSignals] =
      await Promise.all([
        this.checkVelocity(ctx),
        this.checkBehavior(ctx),
        this.checkDevice(ctx),
        this.checkNetwork(ctx),
        this.checkRelationships(ctx),
      ]);

    signals.push(
      ...velocitySignals,
      ...behaviorSignals,
      ...deviceSignals,
      ...networkSignals,
      ...relationshipSignals
    );

    // Calculate weighted risk score
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const overallScore =
      signals.reduce((sum, s) => sum + s.score * s.weight, 0) / Math.max(totalWeight, 1);

    // Collect flags
    signals.forEach((s) => {
      if (s.score > 0.5) {
        flags.push(s.name);
      }
    });

    // Determine action
    let action: RiskAssessment['action'] = 'allow';

    if (overallScore >= RISK_THRESHOLDS.block) {
      action = 'block';
    } else if (overallScore >= RISK_THRESHOLDS.shadow) {
      action = 'shadow';
    } else if (overallScore >= RISK_THRESHOLDS.challenge) {
      action = 'challenge';
    } else if (overallScore >= RISK_THRESHOLDS.throttle) {
      action = 'throttle';
    }

    // Log event to Redis stream for async processing
    await this.logEvent(ctx, { overallScore, signals, action, flags });

    logger.debug(
      {
        userId: ctx.userId,
        action: ctx.action,
        riskScore: overallScore,
        decision: action,
        flagCount: flags.length,
      },
      'Risk assessment completed'
    );

    return { overallScore, signals, action, flags };
  }

  private async checkVelocity(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);

    // Check message velocity
    if (ctx.action === 'message') {
      const [perMinute, perHour] = await Promise.all([
        this.redis.incr(`velocity:msg:${ctx.userId}:${minute}`),
        this.redis.incr(`velocity:msg:${ctx.userId}:${hour}`),
      ]);

      // Set expiry on first increment
      if (perMinute === 1) {
        await this.redis.expire(`velocity:msg:${ctx.userId}:${minute}`, 120);
      }
      if (perHour === 1) {
        await this.redis.expire(`velocity:msg:${ctx.userId}:${hour}`, 7200);
      }

      signals.push({
        name: 'high_message_velocity_minute',
        score: Math.min(perMinute / VELOCITY_LIMITS.messages_per_minute, 1),
        weight: 3,
        details: { count: perMinute, limit: VELOCITY_LIMITS.messages_per_minute },
      });

      signals.push({
        name: 'high_message_velocity_hour',
        score: Math.min(perHour / VELOCITY_LIMITS.messages_per_hour, 1),
        weight: 2,
        details: { count: perHour, limit: VELOCITY_LIMITS.messages_per_hour },
      });
    }

    // Check conversation start velocity
    if (ctx.action === 'conversation_start') {
      const perHour = await this.redis.incr(`velocity:conv:${ctx.userId}:${hour}`);

      if (perHour === 1) {
        await this.redis.expire(`velocity:conv:${ctx.userId}:${hour}`, 7200);
      }

      signals.push({
        name: 'high_conversation_velocity',
        score: Math.min(perHour / VELOCITY_LIMITS.conversations_per_hour, 1),
        weight: 2,
        details: { count: perHour, limit: VELOCITY_LIMITS.conversations_per_hour },
      });
    }

    // Check if user is interacting with own characters
    if (ctx.creatorId && ctx.creatorId === ctx.userId) {
      signals.push({
        name: 'self_interaction',
        score: 1.0,
        weight: 10, // Very strong signal
        details: { characterId: ctx.characterId },
      });
    }

    return signals;
  }

  private async checkBehavior(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    // Check for new account
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (user) {
      const accountAgeDays = (Date.now() - user.createdAt.getTime()) / 86400000;
      if (accountAgeDays < 1) {
        signals.push({
          name: 'new_account',
          score: 1 - accountAgeDays,
          weight: 2,
          details: { ageDays: accountAgeDays },
        });
      }

      // Check verification level
      if (!user.emailVerified) {
        signals.push({
          name: 'unverified_email',
          score: 0.3,
          weight: 1,
        });
      }

      // Check subscription tier (free accounts are higher risk)
      if (user.subscriptionTier === 'FREE') {
        signals.push({
          name: 'free_tier_account',
          score: 0.2,
          weight: 1,
        });
      }
    }

    return signals;
  }

  private async checkDevice(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    if (!ctx.deviceFingerprint) {
      signals.push({
        name: 'no_fingerprint',
        score: 0.3,
        weight: 1,
      });
      return signals;
    }

    // Check how many users share this device fingerprint
    // This would require the DeviceFingerprint and UserSession models
    // For now, we'll check in Redis
    const deviceUsers = await this.redis.smembers(`device:users:${ctx.deviceFingerprint}`);
    await this.redis.sadd(`device:users:${ctx.deviceFingerprint}`, ctx.userId);
    await this.redis.expire(`device:users:${ctx.deviceFingerprint}`, 86400 * 30); // 30 days

    if (deviceUsers.length > 1 && !deviceUsers.includes(ctx.userId)) {
      signals.push({
        name: 'shared_device',
        score: Math.min(deviceUsers.length / 5, 1),
        weight: 5,
        details: { userCount: deviceUsers.length + 1 },
      });
    }

    return signals;
  }

  private async checkNetwork(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    // Check for VPN/proxy/datacenter IP (from cache or IP intelligence service)
    const ipInfo = await this.getIpInfo(ctx.ipAddress);

    if (ipInfo.isVpn || ipInfo.isProxy) {
      signals.push({
        name: 'vpn_or_proxy',
        score: 0.5,
        weight: 2,
        details: { type: ipInfo.isVpn ? 'vpn' : 'proxy' },
      });
    }

    if (ipInfo.isDatacenter) {
      signals.push({
        name: 'datacenter_ip',
        score: 0.8,
        weight: 4,
        details: { asn: ipInfo.asn },
      });
    }

    if (ipInfo.isTor) {
      signals.push({
        name: 'tor_exit_node',
        score: 0.7,
        weight: 3,
      });
    }

    // Check how many users share this IP
    const ipUsers = await this.redis.smembers(`ip:users:${ctx.ipAddress}`);
    await this.redis.sadd(`ip:users:${ctx.ipAddress}`, ctx.userId);
    await this.redis.expire(`ip:users:${ctx.ipAddress}`, 86400); // 24 hours

    if (ipUsers.length > 3) {
      // Some sharing is normal (households, offices)
      signals.push({
        name: 'shared_ip',
        score: Math.min((ipUsers.length - 3) / 10, 1),
        weight: 3,
        details: { userCount: ipUsers.length + 1 },
      });
    }

    return signals;
  }

  private async checkRelationships(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    if (!ctx.creatorId) return signals;

    // Check if user and creator share same device or IP
    const [sameDevice, sameIp] = await Promise.all([
      this.checkSameDevice(ctx.userId, ctx.creatorId),
      this.checkSameIp(ctx.userId, ctx.creatorId),
    ]);

    if (sameDevice) {
      signals.push({
        name: 'creator_same_device',
        score: 1.0,
        weight: 10,
        details: { creatorId: ctx.creatorId },
      });
    }

    if (sameIp) {
      signals.push({
        name: 'creator_same_ip',
        score: 0.8,
        weight: 8,
        details: { creatorId: ctx.creatorId },
      });
    }

    return signals;
  }

  private async checkSameDevice(userId: string, creatorId: string): Promise<boolean> {
    // Get all device fingerprints for both users
    const userDevices = await this.redis.smembers(`user:devices:${userId}`);
    const creatorDevices = await this.redis.smembers(`user:devices:${creatorId}`);

    // Check for intersection
    return userDevices.some((d) => creatorDevices.includes(d));
  }

  private async checkSameIp(userId: string, creatorId: string): Promise<boolean> {
    // Get recent IPs for both users
    const userIps = await this.redis.smembers(`user:ips:${userId}`);
    const creatorIps = await this.redis.smembers(`user:ips:${creatorId}`);

    // Check for intersection
    return userIps.some((ip) => creatorIps.includes(ip));
  }

  private async getIpInfo(ip: string): Promise<{
    isVpn: boolean;
    isProxy: boolean;
    isDatacenter: boolean;
    isTor: boolean;
    asn: string | null;
    country: string | null;
  }> {
    // Check cache first
    const cached = await this.redis.get(`ip_info:${ip}`);
    if (cached) return JSON.parse(cached);

    // In production, integrate with an IP intelligence service like:
    // - MaxMind GeoIP2
    // - IPQualityScore
    // - ip-api.com
    // For now, return defaults
    const info = {
      isVpn: false,
      isProxy: false,
      isDatacenter: false,
      isTor: false,
      asn: null,
      country: null,
    };

    // Cache for 1 hour
    await this.redis.setex(`ip_info:${ip}`, 3600, JSON.stringify(info));

    return info;
  }

  private async logEvent(ctx: DetectionContext, assessment: RiskAssessment): Promise<void> {
    try {
      await this.redis.xadd(
        'fraud:events',
        '*',
        'userId',
        ctx.userId,
        'sessionId',
        ctx.sessionId,
        'action',
        ctx.action,
        'riskScore',
        assessment.overallScore.toString(),
        'decision',
        assessment.action,
        'flags',
        JSON.stringify(assessment.flags),
        'signals',
        JSON.stringify(assessment.signals),
        'timestamp',
        Date.now().toString()
      );
    } catch (error) {
      logger.error({ error }, 'Failed to log fraud event');
    }
  }

  /**
   * Track user device fingerprint for future correlation.
   */
  async trackDevice(userId: string, fingerprint: string): Promise<void> {
    await this.redis.sadd(`user:devices:${userId}`, fingerprint);
    await this.redis.expire(`user:devices:${userId}`, 86400 * 90); // 90 days
  }

  /**
   * Track user IP address for future correlation.
   */
  async trackIp(userId: string, ipAddress: string): Promise<void> {
    await this.redis.sadd(`user:ips:${userId}`, ipAddress);
    await this.redis.expire(`user:ips:${userId}`, 86400 * 30); // 30 days
  }
}
