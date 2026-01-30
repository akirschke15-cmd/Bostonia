/**
 * Request Signing Service
 *
 * Implements request authentication beyond JWT:
 * - Request signing to prevent replay attacks
 * - Nonce tracking
 * - Timestamp validation
 * - Device binding verification
 */

import crypto from 'crypto';
import type { Redis } from 'ioredis';
import type {
  SignedRequest,
  RequestSigningConfig,
} from '../types/fraud.types.js';

// Default configuration
const DEFAULT_CONFIG: RequestSigningConfig = {
  algorithm: 'HMAC-SHA256',
  timestampTolerance: 300, // 5 minutes
  nonceExpiry: 600, // 10 minutes
  requireSignature: false,
};

// Nonce expiry time (seconds)
const NONCE_TTL = 600;

export class RequestSigningService {
  private redis: Redis;
  private keyPrefix: string;
  private config: RequestSigningConfig;
  private hmacKeys: Map<string, string> = new Map();

  constructor(
    redis: Redis,
    keyPrefix = 'bostonia:signing',
    config: Partial<RequestSigningConfig> = {}
  ) {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // KEY MANAGEMENT
  // ===========================================================================

  /**
   * Generate a new signing key for a user/device
   */
  async generateSigningKey(
    userId: string,
    deviceId: string
  ): Promise<{ keyId: string; secret: string }> {
    const keyId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('base64');

    // Store key metadata
    const key = `${this.keyPrefix}:keys:${keyId}`;
    await this.redis.hset(key, {
      userId,
      deviceId,
      createdAt: Date.now().toString(),
      lastUsed: Date.now().toString(),
    });
    await this.redis.expire(key, 86400 * 30); // 30 days

    // Store secret hash (not the actual secret)
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
    await this.redis.hset(key, 'secretHash', secretHash);

    // Cache for quick lookups
    this.hmacKeys.set(keyId, secret);

    return { keyId, secret };
  }

  /**
   * Rotate signing key for a user/device
   */
  async rotateSigningKey(
    userId: string,
    deviceId: string,
    oldKeyId: string
  ): Promise<{ keyId: string; secret: string }> {
    // Generate new key
    const newKey = await this.generateSigningKey(userId, deviceId);

    // Mark old key as rotated (allow grace period)
    const oldKey = `${this.keyPrefix}:keys:${oldKeyId}`;
    await this.redis.hset(oldKey, 'rotatedTo', newKey.keyId);
    await this.redis.expire(oldKey, 3600); // 1 hour grace period

    return newKey;
  }

  /**
   * Revoke a signing key
   */
  async revokeSigningKey(keyId: string): Promise<void> {
    const key = `${this.keyPrefix}:keys:${keyId}`;
    await this.redis.hset(key, 'revoked', 'true');
    await this.redis.expire(key, 86400); // Keep record for 24 hours

    // Remove from cache
    this.hmacKeys.delete(keyId);
  }

  // ===========================================================================
  // REQUEST SIGNING
  // ===========================================================================

  /**
   * Create a signed request (client-side equivalent)
   */
  createSignedRequest(
    keyId: string,
    secret: string,
    payload: Record<string, unknown>
  ): SignedRequest {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const payloadString = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadString).toString('base64');

    // Create signature
    const signatureData = `${timestamp}.${nonce}.${payloadBase64}`;
    const signature = this.createSignature(secret, signatureData);

    return {
      timestamp,
      nonce,
      signature,
      publicKeyId: keyId,
      payload: payloadBase64,
    };
  }

  /**
   * Verify a signed request
   */
  async verifySignedRequest(
    signedRequest: SignedRequest
  ): Promise<{
    valid: boolean;
    reason: string | null;
    payload: Record<string, unknown> | null;
    userId: string | null;
    deviceId: string | null;
  }> {
    // Check timestamp
    const timestampResult = this.verifyTimestamp(signedRequest.timestamp);
    if (!timestampResult.valid) {
      return {
        valid: false,
        reason: timestampResult.reason,
        payload: null,
        userId: null,
        deviceId: null,
      };
    }

    // Check nonce (prevent replay)
    const nonceResult = await this.verifyNonce(signedRequest.nonce);
    if (!nonceResult.valid) {
      return {
        valid: false,
        reason: nonceResult.reason,
        payload: null,
        userId: null,
        deviceId: null,
      };
    }

    // Get key metadata
    const keyMeta = await this.getKeyMetadata(signedRequest.publicKeyId);
    if (!keyMeta) {
      return {
        valid: false,
        reason: 'Invalid or expired signing key',
        payload: null,
        userId: null,
        deviceId: null,
      };
    }

    if (keyMeta.revoked) {
      return {
        valid: false,
        reason: 'Signing key has been revoked',
        payload: null,
        userId: null,
        deviceId: null,
      };
    }

    // Verify signature
    const signatureValid = await this.verifySignature(signedRequest, keyMeta.secretHash);
    if (!signatureValid) {
      return {
        valid: false,
        reason: 'Invalid signature',
        payload: null,
        userId: keyMeta.userId,
        deviceId: keyMeta.deviceId,
      };
    }

    // Mark nonce as used
    await this.markNonceUsed(signedRequest.nonce);

    // Update last used timestamp
    await this.redis.hset(
      `${this.keyPrefix}:keys:${signedRequest.publicKeyId}`,
      'lastUsed',
      Date.now().toString()
    );

    // Decode payload
    let payload: Record<string, unknown> | null = null;
    try {
      const payloadString = Buffer.from(signedRequest.payload, 'base64').toString('utf-8');
      payload = JSON.parse(payloadString);
    } catch {
      return {
        valid: false,
        reason: 'Invalid payload encoding',
        payload: null,
        userId: keyMeta.userId,
        deviceId: keyMeta.deviceId,
      };
    }

    return {
      valid: true,
      reason: null,
      payload,
      userId: keyMeta.userId,
      deviceId: keyMeta.deviceId,
    };
  }

  // ===========================================================================
  // VERIFICATION HELPERS
  // ===========================================================================

  private verifyTimestamp(timestamp: number): { valid: boolean; reason: string | null } {
    const now = Date.now();
    const diff = Math.abs(now - timestamp);
    const toleranceMs = this.config.timestampTolerance * 1000;

    if (diff > toleranceMs) {
      return {
        valid: false,
        reason: `Request timestamp outside tolerance window (${Math.round(diff / 1000)}s)`,
      };
    }

    // Reject future timestamps
    if (timestamp > now + 60000) {
      // Allow 1 minute clock skew
      return {
        valid: false,
        reason: 'Request timestamp is in the future',
      };
    }

    return { valid: true, reason: null };
  }

  private async verifyNonce(nonce: string): Promise<{ valid: boolean; reason: string | null }> {
    const key = `${this.keyPrefix}:nonces:${nonce}`;
    const exists = await this.redis.exists(key);

    if (exists) {
      return { valid: false, reason: 'Nonce has already been used (possible replay attack)' };
    }

    return { valid: true, reason: null };
  }

  private async markNonceUsed(nonce: string): Promise<void> {
    const key = `${this.keyPrefix}:nonces:${nonce}`;
    await this.redis.setex(key, NONCE_TTL, '1');
  }

  private async getKeyMetadata(keyId: string): Promise<{
    userId: string;
    deviceId: string;
    secretHash: string;
    revoked: boolean;
    rotatedTo: string | null;
  } | null> {
    const key = `${this.keyPrefix}:keys:${keyId}`;
    const data = await this.redis.hgetall(key);

    if (!data || !data.userId) return null;

    return {
      userId: data.userId,
      deviceId: data.deviceId,
      secretHash: data.secretHash,
      revoked: data.revoked === 'true',
      rotatedTo: data.rotatedTo || null,
    };
  }

  private createSignature(secret: string, data: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  private async verifySignature(
    request: SignedRequest,
    secretHash: string
  ): Promise<boolean> {
    // In a real implementation, you'd need the actual secret
    // Here we're using a cached version or rejecting
    const cachedSecret = this.hmacKeys.get(request.publicKeyId);

    if (!cachedSecret) {
      // Can't verify without secret - this would require a different approach
      // in production (e.g., storing encrypted secrets or using asymmetric crypto)
      return false;
    }

    const signatureData = `${request.timestamp}.${request.nonce}.${request.payload}`;
    const expectedSignature = this.createSignature(cachedSecret, signatureData);

    return crypto.timingSafeEqual(
      Buffer.from(request.signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // ===========================================================================
  // TOKEN ROTATION
  // ===========================================================================

  /**
   * Check if key rotation is needed
   */
  async shouldRotateKey(keyId: string): Promise<{ shouldRotate: boolean; reason: string | null }> {
    const key = `${this.keyPrefix}:keys:${keyId}`;
    const data = await this.redis.hgetall(key);

    if (!data || !data.createdAt) {
      return { shouldRotate: true, reason: 'Key not found' };
    }

    const createdAt = parseInt(data.createdAt, 10);
    const lastUsed = parseInt(data.lastUsed || data.createdAt, 10);
    const now = Date.now();

    // Rotate if key is older than 7 days
    if (now - createdAt > 86400 * 7 * 1000) {
      return { shouldRotate: true, reason: 'Key age exceeds 7 days' };
    }

    // Rotate if not used in 24 hours (might be compromised and unused)
    if (now - lastUsed > 86400 * 1000) {
      return { shouldRotate: true, reason: 'Key not used in 24 hours' };
    }

    return { shouldRotate: false, reason: null };
  }

  /**
   * Get all active keys for a user
   */
  async getUserKeys(userId: string): Promise<
    Array<{
      keyId: string;
      deviceId: string;
      createdAt: number;
      lastUsed: number;
    }>
  > {
    // This would require a secondary index in production
    // For now, we'd need to scan (not recommended for production)
    const pattern = `${this.keyPrefix}:keys:*`;
    const keys = await this.redis.keys(pattern);
    const userKeys: Array<{
      keyId: string;
      deviceId: string;
      createdAt: number;
      lastUsed: number;
    }> = [];

    for (const key of keys) {
      const data = await this.redis.hgetall(key);
      if (data.userId === userId && !data.revoked) {
        const keyId = key.replace(`${this.keyPrefix}:keys:`, '');
        userKeys.push({
          keyId,
          deviceId: data.deviceId,
          createdAt: parseInt(data.createdAt, 10),
          lastUsed: parseInt(data.lastUsed || data.createdAt, 10),
        });
      }
    }

    return userKeys;
  }

  /**
   * Revoke all keys for a user (e.g., on password change)
   */
  async revokeAllUserKeys(userId: string): Promise<number> {
    const keys = await this.getUserKeys(userId);
    let revokedCount = 0;

    for (const key of keys) {
      await this.revokeSigningKey(key.keyId);
      revokedCount++;
    }

    return revokedCount;
  }
}
