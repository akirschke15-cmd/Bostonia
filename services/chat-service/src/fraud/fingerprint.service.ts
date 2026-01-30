/**
 * Request & Device Fingerprinting Service
 *
 * Collects and analyzes fingerprints for:
 * - Request headers and metadata
 * - TLS fingerprinting (JA3/JA4)
 * - Device/browser characteristics
 * - Session binding and verification
 */

import type { Request } from 'express';
import type { Redis } from 'ioredis';
import crypto from 'crypto';
import type {
  RequestFingerprint,
  DeviceFingerprint,
  SessionFingerprint,
  AutomationIndicator,
} from '../types/fraud.types.js';

// Fingerprint cache TTL (24 hours)
const FINGERPRINT_TTL = 86400;
const SESSION_TTL = 3600 * 24 * 7; // 7 days

export class FingerprintService {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix = 'bostonia:fp') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // REQUEST FINGERPRINTING
  // ===========================================================================

  /**
   * Extract fingerprint from incoming HTTP request
   */
  extractRequestFingerprint(req: Request): RequestFingerprint {
    const headers = req.headers;

    // Extract forwarded IPs
    const forwardedFor = this.parseForwardedFor(headers['x-forwarded-for']);

    return {
      // Device & Browser
      userAgent: (headers['user-agent'] as string) || '',
      acceptLanguage: (headers['accept-language'] as string) || '',
      acceptEncoding: (headers['accept-encoding'] as string) || '',
      connection: (headers['connection'] as string) || '',

      // Network
      clientIp: this.extractClientIp(req),
      forwardedFor,
      realIp: (headers['x-real-ip'] as string) || null,
      cfConnectingIp: (headers['cf-connecting-ip'] as string) || null,

      // TLS Fingerprint (would be populated by proxy/CDN)
      ja3Hash: (headers['x-ja3-hash'] as string) || null,
      ja4Hash: (headers['x-ja4-hash'] as string) || null,
      tlsVersion: (headers['x-tls-version'] as string) || null,
      tlsCipherSuites: this.parseCipherSuites(headers['x-tls-cipher'] as string),

      // Client hints (modern browsers)
      secChUa: (headers['sec-ch-ua'] as string) || null,
      secChUaPlatform: (headers['sec-ch-ua-platform'] as string) || null,
      secChUaMobile: (headers['sec-ch-ua-mobile'] as string) || null,
      secFetchMode: (headers['sec-fetch-mode'] as string) || null,
      secFetchSite: (headers['sec-fetch-site'] as string) || null,
      secFetchDest: (headers['sec-fetch-dest'] as string) || null,

      // Timing
      requestTimestamp: Date.now(),
      timezone: (headers['x-timezone'] as string) || null,
    };
  }

  /**
   * Generate a hash of the request fingerprint for comparison
   */
  hashRequestFingerprint(fp: RequestFingerprint): string {
    // Use stable subset of fingerprint data
    const data = [
      fp.userAgent,
      fp.acceptLanguage,
      fp.acceptEncoding,
      fp.ja3Hash || '',
      fp.secChUa || '',
      fp.secChUaPlatform || '',
    ].join('|');

    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Detect automation indicators from request fingerprint
   */
  detectAutomation(fp: RequestFingerprint): AutomationIndicator[] {
    const indicators: AutomationIndicator[] = [];

    // Check for headless browser indicators in user agent
    const ua = fp.userAgent.toLowerCase();
    if (ua.includes('headlesschrome') || ua.includes('headless')) {
      indicators.push({
        name: 'headless_browser',
        weight: 0.9,
        detected: true,
        confidence: 0.95,
        evidence: 'User-Agent contains headless indicator',
      });
    }

    // Check for PhantomJS
    if (ua.includes('phantomjs')) {
      indicators.push({
        name: 'phantom_js',
        weight: 0.95,
        detected: true,
        confidence: 0.99,
        evidence: 'User-Agent contains PhantomJS',
      });
    }

    // Check for missing browser fingerprint indicators
    if (!fp.secChUa && ua.includes('chrome')) {
      indicators.push({
        name: 'missing_client_hints',
        weight: 0.6,
        detected: true,
        confidence: 0.7,
        evidence: 'Chrome UA without Sec-CH-UA headers',
      });
    }

    // Check for inconsistent accept headers
    if (!fp.acceptLanguage && fp.userAgent) {
      indicators.push({
        name: 'missing_accept_language',
        weight: 0.4,
        detected: true,
        confidence: 0.6,
        evidence: 'Missing Accept-Language header',
      });
    }

    // Check for suspicious TLS fingerprint
    if (fp.ja3Hash) {
      const knownBotJa3 = this.getKnownBotJa3Hashes();
      if (knownBotJa3.includes(fp.ja3Hash)) {
        indicators.push({
          name: 'known_bot_tls',
          weight: 0.85,
          detected: true,
          confidence: 0.9,
          evidence: `JA3 hash matches known automation tool: ${fp.ja3Hash}`,
        });
      }
    }

    // Check for curl/wget/httpie
    if (
      ua.includes('curl') ||
      ua.includes('wget') ||
      ua.includes('httpie') ||
      ua.includes('python-requests')
    ) {
      indicators.push({
        name: 'cli_tool',
        weight: 0.7,
        detected: true,
        confidence: 0.95,
        evidence: 'User-Agent indicates CLI HTTP tool',
      });
    }

    return indicators;
  }

  // ===========================================================================
  // DEVICE FINGERPRINTING
  // ===========================================================================

  /**
   * Validate and process client-side device fingerprint
   */
  async processDeviceFingerprint(
    userId: string,
    clientFingerprint: Partial<DeviceFingerprint>
  ): Promise<DeviceFingerprint> {
    // Generate deterministic device ID from fingerprint components
    const fpComponents = [
      clientFingerprint.screenResolution || '',
      String(clientFingerprint.colorDepth || ''),
      clientFingerprint.platform || '',
      clientFingerprint.webglRenderer || '',
      String(clientFingerprint.hardwareConcurrency || ''),
    ].join('|');

    const deviceId = crypto.createHash('sha256').update(fpComponents).digest('hex').substring(0, 16);

    const fingerprint: DeviceFingerprint = {
      deviceId,
      browserFingerprint: clientFingerprint.browserFingerprint || '',
      screenResolution: clientFingerprint.screenResolution || null,
      colorDepth: clientFingerprint.colorDepth || null,
      platform: clientFingerprint.platform || null,
      plugins: clientFingerprint.plugins || [],
      fonts: clientFingerprint.fonts || [],
      webglRenderer: clientFingerprint.webglRenderer || null,
      canvasHash: clientFingerprint.canvasHash || null,
      audioHash: clientFingerprint.audioHash || null,
      hardwareConcurrency: clientFingerprint.hardwareConcurrency || null,
      deviceMemory: clientFingerprint.deviceMemory || null,
    };

    // Store device fingerprint
    await this.storeDeviceFingerprint(userId, fingerprint);

    return fingerprint;
  }

  /**
   * Check if device fingerprint matches previous sessions
   */
  async verifyDeviceFingerprint(
    userId: string,
    currentFingerprint: DeviceFingerprint
  ): Promise<{ isKnown: boolean; similarity: number; previousDevices: string[] }> {
    const key = `${this.keyPrefix}:devices:${userId}`;
    const storedDevices = await this.redis.hgetall(key);

    if (Object.keys(storedDevices).length === 0) {
      return { isKnown: false, similarity: 0, previousDevices: [] };
    }

    let maxSimilarity = 0;
    const previousDevices: string[] = [];

    for (const [deviceId, fpJson] of Object.entries(storedDevices)) {
      previousDevices.push(deviceId);
      try {
        const storedFp = JSON.parse(fpJson) as DeviceFingerprint;
        const similarity = this.calculateFingerprintSimilarity(currentFingerprint, storedFp);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      } catch {
        // Skip invalid entries
      }
    }

    return {
      isKnown: maxSimilarity >= 0.8,
      similarity: maxSimilarity,
      previousDevices,
    };
  }

  /**
   * Calculate similarity between two device fingerprints
   */
  private calculateFingerprintSimilarity(fp1: DeviceFingerprint, fp2: DeviceFingerprint): number {
    let matches = 0;
    let total = 0;

    // Compare scalar values
    const scalarFields: (keyof DeviceFingerprint)[] = [
      'screenResolution',
      'colorDepth',
      'platform',
      'webglRenderer',
      'hardwareConcurrency',
      'deviceMemory',
    ];

    for (const field of scalarFields) {
      if (fp1[field] !== null && fp2[field] !== null) {
        total++;
        if (fp1[field] === fp2[field]) matches++;
      }
    }

    // Compare arrays (plugins, fonts)
    const arrayFields: ('plugins' | 'fonts')[] = ['plugins', 'fonts'];
    for (const field of arrayFields) {
      const arr1 = fp1[field] || [];
      const arr2 = fp2[field] || [];
      if (arr1.length > 0 && arr2.length > 0) {
        total++;
        const intersection = arr1.filter((x) => arr2.includes(x));
        const similarity = (2 * intersection.length) / (arr1.length + arr2.length);
        matches += similarity;
      }
    }

    // Compare hashes
    if (fp1.canvasHash && fp2.canvasHash) {
      total++;
      if (fp1.canvasHash === fp2.canvasHash) matches++;
    }

    if (fp1.audioHash && fp2.audioHash) {
      total++;
      if (fp1.audioHash === fp2.audioHash) matches++;
    }

    return total > 0 ? matches / total : 0;
  }

  // ===========================================================================
  // SESSION FINGERPRINTING & BINDING
  // ===========================================================================

  /**
   * Create a new bound session
   */
  async createBoundSession(
    sessionId: string,
    userId: string,
    deviceId: string,
    ipAddress: string,
    requestFingerprint: RequestFingerprint
  ): Promise<SessionFingerprint> {
    const bindingHash = this.generateBindingHash(userId, deviceId, requestFingerprint);

    const session: SessionFingerprint = {
      sessionId,
      userId,
      deviceId,
      ipHistory: [ipAddress],
      fingerprintHistory: [this.hashRequestFingerprint(requestFingerprint)],
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isValid: true,
      bindingHash,
    };

    await this.storeSession(session);

    return session;
  }

  /**
   * Validate session binding against current request
   */
  async validateSessionBinding(
    sessionId: string,
    currentDeviceId: string,
    currentIp: string,
    currentFingerprint: RequestFingerprint
  ): Promise<{
    isValid: boolean;
    reason: string | null;
    riskScore: number;
    session: SessionFingerprint | null;
  }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { isValid: false, reason: 'Session not found', riskScore: 1.0, session: null };
    }

    if (!session.isValid) {
      return { isValid: false, reason: 'Session invalidated', riskScore: 1.0, session };
    }

    let riskScore = 0;
    const issues: string[] = [];

    // Check device binding
    if (session.deviceId !== currentDeviceId) {
      riskScore += 0.4;
      issues.push('Device mismatch');
    }

    // Check IP consistency (allow some variation for mobile users)
    if (!session.ipHistory.includes(currentIp)) {
      // Check if IP is in same subnet
      const isSameSubnet = this.isSameSubnet(currentIp, session.ipHistory[session.ipHistory.length - 1] || '');
      if (!isSameSubnet) {
        riskScore += 0.2;
        issues.push('IP address change');
      }
    }

    // Check fingerprint consistency
    const currentFpHash = this.hashRequestFingerprint(currentFingerprint);
    if (!session.fingerprintHistory.includes(currentFpHash)) {
      riskScore += 0.2;
      issues.push('Fingerprint variation');
    }

    // Update session activity
    await this.updateSessionActivity(sessionId, currentIp, currentFpHash);

    return {
      isValid: riskScore < 0.6,
      reason: issues.length > 0 ? issues.join(', ') : null,
      riskScore,
      session,
    };
  }

  /**
   * Invalidate a session (e.g., on suspicious activity)
   */
  async invalidateSession(sessionId: string, reason: string): Promise<void> {
    const key = `${this.keyPrefix}:session:${sessionId}`;
    const session = await this.getSession(sessionId);

    if (session) {
      session.isValid = false;
      await this.redis.setex(key, SESSION_TTL, JSON.stringify(session));

      // Log invalidation
      await this.redis.lpush(
        `${this.keyPrefix}:invalidations:${session.userId}`,
        JSON.stringify({ sessionId, reason, timestamp: Date.now() })
      );
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private extractClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips?.trim() || req.ip || req.socket?.remoteAddress || 'unknown';
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] || 'unknown' : realIp;
    }

    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private parseForwardedFor(header: string | string[] | undefined): string[] {
    if (!header) return [];
    const value = Array.isArray(header) ? header[0] : header;
    return value
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
  }

  private parseCipherSuites(header: string | undefined): string[] {
    if (!header) return [];
    return header.split(',').map((suite) => suite.trim());
  }

  private generateBindingHash(
    userId: string,
    deviceId: string,
    fp: RequestFingerprint
  ): string {
    const data = `${userId}:${deviceId}:${fp.userAgent}:${fp.ja3Hash || ''}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private isSameSubnet(ip1: string, ip2: string): boolean {
    // Simple /24 subnet check for IPv4
    if (!ip1 || !ip2) return false;

    const parts1 = ip1.split('.');
    const parts2 = ip2.split('.');

    if (parts1.length !== 4 || parts2.length !== 4) return false;

    return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2];
  }

  private async storeDeviceFingerprint(
    userId: string,
    fingerprint: DeviceFingerprint
  ): Promise<void> {
    const key = `${this.keyPrefix}:devices:${userId}`;
    await this.redis.hset(key, fingerprint.deviceId, JSON.stringify(fingerprint));
    await this.redis.expire(key, FINGERPRINT_TTL * 30); // 30 days
  }

  private async storeSession(session: SessionFingerprint): Promise<void> {
    const key = `${this.keyPrefix}:session:${session.sessionId}`;
    await this.redis.setex(key, SESSION_TTL, JSON.stringify(session));

    // Index by user
    await this.redis.sadd(`${this.keyPrefix}:user-sessions:${session.userId}`, session.sessionId);
  }

  private async getSession(sessionId: string): Promise<SessionFingerprint | null> {
    const key = `${this.keyPrefix}:session:${sessionId}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      const session = JSON.parse(data) as SessionFingerprint;
      session.createdAt = new Date(session.createdAt);
      session.lastActiveAt = new Date(session.lastActiveAt);
      return session;
    } catch {
      return null;
    }
  }

  private async updateSessionActivity(
    sessionId: string,
    ip: string,
    fpHash: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.lastActiveAt = new Date();

    // Add to IP history (keep last 10)
    if (!session.ipHistory.includes(ip)) {
      session.ipHistory.push(ip);
      if (session.ipHistory.length > 10) {
        session.ipHistory.shift();
      }
    }

    // Add to fingerprint history (keep last 5)
    if (!session.fingerprintHistory.includes(fpHash)) {
      session.fingerprintHistory.push(fpHash);
      if (session.fingerprintHistory.length > 5) {
        session.fingerprintHistory.shift();
      }
    }

    await this.storeSession(session);
  }

  private getKnownBotJa3Hashes(): string[] {
    // Known JA3 hashes for automation tools
    // These would be maintained and updated regularly
    return [
      '3b5074b1b5d032e5620f69f9f700ff0e', // Python requests (older)
      '2c25adc8a2bf7e4e5eae7d5d6b86a6b5', // curl
      '473cd7cb9faa642487833865d516e578', // wget
      'cd08e31494f9531f560d64c695473da9', // Go http client
      'a0e9f5d64349fb13f4f1a4ec7dd49bb3', // Node.js https (default)
      'bc6c386f480ee97b9d9e52d472b772d8', // Selenium ChromeDriver
      '56c9a76df75df53c5f96cf3c9b8ee2db', // PhantomJS
    ];
  }
}
