/**
 * WebSocket Protection Service
 *
 * Protections for real-time WebSocket connections:
 * - Connection rate limiting
 * - Per-connection message rate limiting
 * - Heartbeat/ping validation
 * - Connection pooling detection
 * - Message pattern analysis
 */

import type { Redis } from 'ioredis';
import type { Socket } from 'socket.io';
import type {
  WebSocketSession,
  WebSocketRateLimit,
  WebSocketFlag,
  WebSocketMetrics,
  TrustTier,
} from '../types/fraud.types.js';

// Default WebSocket limits by trust tier
const WS_LIMITS: Record<TrustTier, WebSocketRateLimit> = {
  UNTRUSTED: {
    messagesPerSecond: 0.5,
    messagesPerMinute: 10,
    maxMessageSize: 1024,
    connectionDuration: 300, // 5 min max
    reconnectCooldown: 30,
  },
  LOW: {
    messagesPerSecond: 1,
    messagesPerMinute: 30,
    maxMessageSize: 2048,
    connectionDuration: 1800, // 30 min
    reconnectCooldown: 10,
  },
  MEDIUM: {
    messagesPerSecond: 3,
    messagesPerMinute: 60,
    maxMessageSize: 8192,
    connectionDuration: 7200, // 2 hours
    reconnectCooldown: 2,
  },
  HIGH: {
    messagesPerSecond: 5,
    messagesPerMinute: 120,
    maxMessageSize: 16384,
    connectionDuration: 28800, // 8 hours
    reconnectCooldown: 1,
  },
  VERIFIED: {
    messagesPerSecond: 10,
    messagesPerMinute: 300,
    maxMessageSize: 32768,
    connectionDuration: 86400, // 24 hours
    reconnectCooldown: 0,
  },
};

// Suspicious patterns
const SUSPICIOUS_PATTERNS = {
  RAPID_RECONNECT_THRESHOLD: 5, // 5 reconnects in window
  RAPID_RECONNECT_WINDOW: 60, // 60 seconds
  MESSAGE_BURST_THRESHOLD: 10, // 10 messages in window
  MESSAGE_BURST_WINDOW: 2, // 2 seconds
  POOLING_CONNECTION_THRESHOLD: 5, // 5 connections per device
};

export class WebSocketProtectionService {
  private redis: Redis;
  private keyPrefix: string;
  private sessions: Map<string, WebSocketSession> = new Map();

  constructor(redis: Redis, keyPrefix = 'bostonia:ws') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT
  // ===========================================================================

  /**
   * Handle new WebSocket connection
   */
  async onConnection(
    socket: Socket,
    userId: string,
    deviceId: string,
    ipAddress: string,
    trustTier: TrustTier
  ): Promise<{ allowed: boolean; reason: string | null; session: WebSocketSession | null }> {
    // Check reconnect cooldown
    const cooldownResult = await this.checkReconnectCooldown(userId, deviceId);
    if (!cooldownResult.allowed) {
      return {
        allowed: false,
        reason: `Reconnect cooldown: wait ${cooldownResult.waitTime}s`,
        session: null,
      };
    }

    // Check for connection pooling
    const poolingResult = await this.checkConnectionPooling(userId, deviceId);
    if (!poolingResult.allowed) {
      return {
        allowed: false,
        reason: 'Too many concurrent connections',
        session: null,
      };
    }

    // Check rapid reconnects
    const rapidReconnectResult = await this.checkRapidReconnects(userId, ipAddress);
    if (!rapidReconnectResult.allowed) {
      return {
        allowed: false,
        reason: 'Too many reconnection attempts',
        session: null,
      };
    }

    // Create session
    const session: WebSocketSession = {
      socketId: socket.id,
      userId,
      deviceId,
      connectionTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      rateLimitState: WS_LIMITS[trustTier],
      suspicionScore: 0,
      flags: [],
    };

    // Store session
    this.sessions.set(socket.id, session);
    await this.storeSession(session);

    // Track connection
    await this.trackConnection(userId, deviceId, ipAddress);

    return { allowed: true, reason: null, session };
  }

  /**
   * Handle WebSocket disconnection
   */
  async onDisconnection(socketId: string): Promise<void> {
    const session = this.sessions.get(socketId);
    if (!session) return;

    // Record disconnection for analytics
    await this.recordDisconnection(session);

    // Clean up
    this.sessions.delete(socketId);
    await this.removeSession(socketId);
  }

  // ===========================================================================
  // MESSAGE RATE LIMITING
  // ===========================================================================

  /**
   * Check if message is allowed and update rate limit state
   */
  async checkMessageRateLimit(
    socketId: string,
    messageSize: number
  ): Promise<{ allowed: boolean; reason: string | null; flags: WebSocketFlag[] }> {
    const session = this.sessions.get(socketId);
    if (!session) {
      return { allowed: false, reason: 'Session not found', flags: [] };
    }

    const flags: WebSocketFlag[] = [];
    const limits = session.rateLimitState;

    // Check message size
    if (messageSize > limits.maxMessageSize) {
      flags.push('LARGE_PAYLOAD');
      session.flags.push('LARGE_PAYLOAD');
      return {
        allowed: false,
        reason: `Message too large: ${messageSize} > ${limits.maxMessageSize}`,
        flags,
      };
    }

    // Check per-second limit
    const secondResult = await this.checkWindowLimit(
      `${this.keyPrefix}:msg:sec:${socketId}`,
      1,
      Math.ceil(limits.messagesPerSecond)
    );

    if (!secondResult.allowed) {
      flags.push('MESSAGE_BURST');
      return {
        allowed: false,
        reason: 'Message rate exceeded (per second)',
        flags,
      };
    }

    // Check per-minute limit
    const minuteResult = await this.checkWindowLimit(
      `${this.keyPrefix}:msg:min:${socketId}`,
      60,
      limits.messagesPerMinute
    );

    if (!minuteResult.allowed) {
      flags.push('RAPID_RECONNECT');
      return {
        allowed: false,
        reason: 'Message rate exceeded (per minute)',
        flags,
      };
    }

    // Check for burst patterns
    const burstDetected = await this.detectMessageBurst(socketId);
    if (burstDetected) {
      flags.push('MESSAGE_BURST');
      session.suspicionScore += 0.2;
    }

    // Update session
    session.messageCount++;
    session.lastActivity = new Date();
    this.sessions.set(socketId, session);

    return { allowed: true, reason: null, flags };
  }

  /**
   * Check sliding window limit
   */
  private async checkWindowLimit(
    key: string,
    windowSeconds: number,
    limit: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    const script = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window_start = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local window_ms = tonumber(ARGV[4])

      redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
      local count = redis.call('ZCARD', key)

      if count >= limit then
        return {0, 0}
      end

      redis.call('ZADD', key, now, now .. '-' .. math.random())
      redis.call('PEXPIRE', key, window_ms + 1000)

      return {1, limit - count - 1}
    `;

    const result = (await this.redis.eval(
      script,
      1,
      key,
      now.toString(),
      windowStart.toString(),
      limit.toString(),
      windowMs.toString()
    )) as [number, number];

    return {
      allowed: result[0] === 1,
      remaining: Math.max(0, result[1]),
    };
  }

  // ===========================================================================
  // HEARTBEAT VALIDATION
  // ===========================================================================

  /**
   * Validate heartbeat timing
   */
  async validateHeartbeat(
    socketId: string,
    expectedInterval: number
  ): Promise<{ valid: boolean; reason: string | null }> {
    const session = this.sessions.get(socketId);
    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    const key = `${this.keyPrefix}:heartbeat:${socketId}`;
    const lastHeartbeat = await this.redis.get(key);

    if (lastHeartbeat) {
      const elapsed = Date.now() - parseInt(lastHeartbeat, 10);
      const tolerance = expectedInterval * 0.2; // 20% tolerance

      // Check for too-fast heartbeats (synthetic)
      if (elapsed < expectedInterval - tolerance) {
        session.flags.push('INVALID_HEARTBEAT');
        session.suspicionScore += 0.1;
        return { valid: false, reason: 'Heartbeat too frequent' };
      }

      // Check for missed heartbeats
      if (elapsed > expectedInterval * 2) {
        // Connection may be stale but heartbeat itself is valid
        return { valid: true, reason: 'Missed heartbeat detected' };
      }
    }

    // Update heartbeat timestamp
    await this.redis.setex(key, expectedInterval * 3, Date.now().toString());

    return { valid: true, reason: null };
  }

  // ===========================================================================
  // CONNECTION POOLING DETECTION
  // ===========================================================================

  /**
   * Check for connection pooling abuse
   */
  private async checkConnectionPooling(
    userId: string,
    deviceId: string
  ): Promise<{ allowed: boolean; connectionCount: number }> {
    const key = `${this.keyPrefix}:connections:${userId}:${deviceId}`;
    const count = await this.redis.scard(key);

    if (count >= SUSPICIOUS_PATTERNS.POOLING_CONNECTION_THRESHOLD) {
      return { allowed: false, connectionCount: count };
    }

    return { allowed: true, connectionCount: count };
  }

  /**
   * Track active connection
   */
  private async trackConnection(
    userId: string,
    deviceId: string,
    ipAddress: string
  ): Promise<void> {
    // Track per device
    const deviceKey = `${this.keyPrefix}:connections:${userId}:${deviceId}`;
    await this.redis.sadd(deviceKey, `${Date.now()}`);
    await this.redis.expire(deviceKey, 86400);

    // Track reconnections
    const reconnectKey = `${this.keyPrefix}:reconnects:${userId}`;
    await this.redis.zadd(reconnectKey, Date.now().toString(), `${Date.now()}-${ipAddress}`);
    await this.redis.expire(reconnectKey, 3600);
  }

  /**
   * Check for rapid reconnection attempts
   */
  private async checkRapidReconnects(
    userId: string,
    ipAddress: string
  ): Promise<{ allowed: boolean; reconnectCount: number }> {
    const key = `${this.keyPrefix}:reconnects:${userId}`;
    const windowStart = Date.now() - SUSPICIOUS_PATTERNS.RAPID_RECONNECT_WINDOW * 1000;

    await this.redis.zremrangebyscore(key, 0, windowStart);
    const count = await this.redis.zcard(key);

    if (count >= SUSPICIOUS_PATTERNS.RAPID_RECONNECT_THRESHOLD) {
      return { allowed: false, reconnectCount: count };
    }

    return { allowed: true, reconnectCount: count };
  }

  /**
   * Check reconnect cooldown
   */
  private async checkReconnectCooldown(
    userId: string,
    deviceId: string
  ): Promise<{ allowed: boolean; waitTime: number }> {
    const key = `${this.keyPrefix}:cooldown:${userId}:${deviceId}`;
    const ttl = await this.redis.ttl(key);

    if (ttl > 0) {
      return { allowed: false, waitTime: ttl };
    }

    return { allowed: true, waitTime: 0 };
  }

  // ===========================================================================
  // PATTERN DETECTION
  // ===========================================================================

  /**
   * Detect message burst pattern
   */
  private async detectMessageBurst(socketId: string): Promise<boolean> {
    const key = `${this.keyPrefix}:burst:${socketId}`;
    const now = Date.now();
    const windowMs = SUSPICIOUS_PATTERNS.MESSAGE_BURST_WINDOW * 1000;
    const windowStart = now - windowMs;

    // Count recent messages
    await this.redis.zremrangebyscore(key, 0, windowStart);
    const count = await this.redis.zcard(key);

    // Add current message
    await this.redis.zadd(key, now.toString(), now.toString());
    await this.redis.pexpire(key, windowMs + 1000);

    return count >= SUSPICIOUS_PATTERNS.MESSAGE_BURST_THRESHOLD;
  }

  /**
   * Check connection duration limit
   */
  async checkConnectionDuration(socketId: string): Promise<{
    exceeded: boolean;
    duration: number;
    maxDuration: number;
  }> {
    const session = this.sessions.get(socketId);
    if (!session) {
      return { exceeded: false, duration: 0, maxDuration: 0 };
    }

    const duration = (Date.now() - session.connectionTime.getTime()) / 1000;
    const maxDuration = session.rateLimitState.connectionDuration;

    return {
      exceeded: duration > maxDuration,
      duration,
      maxDuration,
    };
  }

  // ===========================================================================
  // METRICS & MONITORING
  // ===========================================================================

  /**
   * Get WebSocket metrics for monitoring
   */
  async getMetrics(): Promise<WebSocketMetrics> {
    const now = Date.now();
    const minuteAgo = now - 60000;

    // Connection stats
    const [connectionRate, disconnectRate, messageRate] = await Promise.all([
      this.redis.zcount(`${this.keyPrefix}:stats:connects`, minuteAgo, now),
      this.redis.zcount(`${this.keyPrefix}:stats:disconnects`, minuteAgo, now),
      this.redis.zcount(`${this.keyPrefix}:stats:messages`, minuteAgo, now),
    ]);

    // Error rate
    const errorRate = await this.redis.get(`${this.keyPrefix}:stats:errors`);

    // Unique devices
    const uniqueDevices = new Set<string>();
    for (const session of this.sessions.values()) {
      uniqueDevices.add(session.deviceId);
    }

    // Check for pooling
    let poolingDetected = false;
    const deviceCounts = new Map<string, number>();
    for (const session of this.sessions.values()) {
      const key = `${session.userId}:${session.deviceId}`;
      const count = (deviceCounts.get(key) || 0) + 1;
      deviceCounts.set(key, count);
      if (count >= SUSPICIOUS_PATTERNS.POOLING_CONNECTION_THRESHOLD) {
        poolingDetected = true;
      }
    }

    return {
      connectionRate,
      disconnectRate,
      messageRate,
      errorRate: errorRate ? parseInt(errorRate, 10) : 0,
      averageLatency: 0, // Would need ping tracking
      uniqueDevices: uniqueDevices.size,
      poolingDetected,
    };
  }

  /**
   * Get session info
   */
  getSession(socketId: string): WebSocketSession | undefined {
    return this.sessions.get(socketId);
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): WebSocketSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId
    );
  }

  /**
   * Force disconnect suspicious session
   */
  async forceDisconnect(socketId: string, reason: string): Promise<void> {
    const session = this.sessions.get(socketId);
    if (!session) return;

    // Log the forced disconnect
    await this.redis.lpush(
      `${this.keyPrefix}:forced-disconnects`,
      JSON.stringify({
        socketId,
        userId: session.userId,
        reason,
        timestamp: Date.now(),
        flags: session.flags,
        suspicionScore: session.suspicionScore,
      })
    );

    // Apply cooldown
    const cooldownKey = `${this.keyPrefix}:cooldown:${session.userId}:${session.deviceId}`;
    await this.redis.setex(cooldownKey, 60, 'forced');
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async storeSession(session: WebSocketSession): Promise<void> {
    const key = `${this.keyPrefix}:session:${session.socketId}`;
    await this.redis.setex(key, 86400, JSON.stringify(session));
  }

  private async removeSession(socketId: string): Promise<void> {
    const key = `${this.keyPrefix}:session:${socketId}`;
    await this.redis.del(key);
  }

  private async recordDisconnection(session: WebSocketSession): Promise<void> {
    const key = `${this.keyPrefix}:stats:disconnects`;
    await this.redis.zadd(key, Date.now().toString(), session.socketId);
    await this.redis.expire(key, 3600);
  }
}
