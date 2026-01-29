import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@bostonia/database';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/error-handler.js';
import { ErrorCodes } from '@bostonia/shared';

// API Key prefix for Bostonia live keys
const API_KEY_PREFIX = 'bos_live_';
const KEY_LENGTH = 32; // 32 random characters after prefix
const BCRYPT_ROUNDS = 10;

export type ApiKeyScope = 'read' | 'write' | 'admin';

export interface GeneratedApiKey {
  key: string;      // Full key (only returned once)
  keyHash: string;  // bcrypt hash for storage
  keyPrefix: string; // First 8 chars for display
}

export interface CreateApiKeyInput {
  name: string;
  scopes?: ApiKeyScope[];
  rateLimit?: number | null;
  expiresAt?: Date | null;
  description?: string | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  scopes?: ApiKeyScope[];
  isActive?: boolean;
  rateLimit?: number | null;
  description?: string | null;
}

export interface ApiKeyResponse {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  rateLimit: number | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
  description: string | null;
}

export interface ApiKeyWithUser {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  rateLimit: number | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
  description: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
    status: string;
    credits: number;
    subscriptionTier: string;
  };
}

export class ApiKeyService {
  /**
   * Generate a new API key with hash and prefix
   */
  generateApiKey(): GeneratedApiKey {
    // Generate 32 random bytes and convert to hex (64 chars), then take first 32
    const randomPart = randomBytes(24).toString('base64url').slice(0, KEY_LENGTH);
    const fullKey = `${API_KEY_PREFIX}${randomPart}`;

    // Hash the full key for storage
    const keyHash = bcrypt.hashSync(fullKey, BCRYPT_ROUNDS);

    // Store prefix for display (first 8 chars of the key for identification)
    const keyPrefix = fullKey.slice(0, 12); // "bos_live_xxx"

    return {
      key: fullKey,
      keyHash,
      keyPrefix,
    };
  }

  /**
   * Validate an API key and return the associated record
   */
  async validateApiKey(key: string): Promise<ApiKeyWithUser | null> {
    // Quick validation of key format
    if (!key.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    // Extract prefix for lookup (optimization to narrow down candidates)
    const keyPrefix = key.slice(0, 12);

    // Find potential matches by prefix
    const candidates = await prisma.apiKey.findMany({
      where: {
        keyPrefix,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            status: true,
            credits: true,
            subscriptionTier: true,
          },
        },
      },
    });

    // Verify hash for each candidate
    for (const candidate of candidates) {
      const isValid = bcrypt.compareSync(key, candidate.keyHash);
      if (isValid) {
        // Parse scopes from JSON
        const scopes = this.parseScopes(candidate.scopes);

        return {
          ...candidate,
          scopes,
          user: candidate.user,
        } as ApiKeyWithUser;
      }
    }

    return null;
  }

  /**
   * Create a new API key for a user
   */
  async createApiKey(
    userId: string,
    data: CreateApiKeyInput
  ): Promise<{ apiKey: ApiKeyResponse; key: string }> {
    // Validate user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
    }

    // Check user limits (e.g., max 10 active keys per user)
    const existingKeysCount = await prisma.apiKey.count({
      where: { userId, isActive: true },
    });

    if (existingKeysCount >= 10) {
      throw new AppError(
        ErrorCodes.FORBIDDEN,
        'Maximum number of API keys (10) reached. Please revoke existing keys first.'
      );
    }

    // Validate scopes
    const scopes = data.scopes || ['read'];
    if (!this.validateScopes(scopes)) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid scopes provided');
    }

    // Generate the key
    const { key, keyHash, keyPrefix } = this.generateApiKey();

    // Create the record
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: data.name,
        keyHash,
        keyPrefix,
        scopes: JSON.stringify(scopes),
        rateLimit: data.rateLimit ?? null,
        expiresAt: data.expiresAt ?? null,
        description: data.description ?? null,
        isActive: true,
      },
    });

    logger.info({ userId, apiKeyId: apiKey.id, name: data.name }, 'API key created');

    return {
      apiKey: this.formatApiKeyResponse(apiKey),
      key, // Only returned once!
    };
  }

  /**
   * List all API keys for a user (never returns full key or hash)
   */
  async listApiKeys(userId: string): Promise<ApiKeyResponse[]> {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return apiKeys.map(key => this.formatApiKeyResponse(key));
  }

  /**
   * Get a single API key by ID
   */
  async getApiKey(id: string, userId: string): Promise<ApiKeyResponse> {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!apiKey) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'API key not found');
    }

    return this.formatApiKeyResponse(apiKey);
  }

  /**
   * Update an API key
   */
  async updateApiKey(
    id: string,
    userId: string,
    data: UpdateApiKeyInput
  ): Promise<ApiKeyResponse> {
    // Verify ownership
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'API key not found');
    }

    // Validate scopes if provided
    if (data.scopes && !this.validateScopes(data.scopes)) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Invalid scopes provided');
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.scopes !== undefined) {
      updateData.scopes = JSON.stringify(data.scopes);
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    if (data.rateLimit !== undefined) {
      updateData.rateLimit = data.rateLimit;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    logger.info({ userId, apiKeyId: id }, 'API key updated');

    return this.formatApiKeyResponse(apiKey);
  }

  /**
   * Revoke (delete) an API key
   */
  async revokeApiKey(id: string, userId: string): Promise<void> {
    // Verify ownership
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'API key not found');
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    logger.info({ userId, apiKeyId: id }, 'API key revoked');
  }

  /**
   * Update the lastUsedAt timestamp for an API key
   */
  async updateLastUsed(id: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Parse scopes from JSON storage
   */
  private parseScopes(scopes: unknown): ApiKeyScope[] {
    if (typeof scopes === 'string') {
      try {
        return JSON.parse(scopes) as ApiKeyScope[];
      } catch {
        return ['read'];
      }
    }
    if (Array.isArray(scopes)) {
      return scopes as ApiKeyScope[];
    }
    return ['read'];
  }

  /**
   * Validate that scopes are valid
   */
  private validateScopes(scopes: string[]): scopes is ApiKeyScope[] {
    const validScopes = ['read', 'write', 'admin'];
    return scopes.every(scope => validScopes.includes(scope));
  }

  /**
   * Format API key record for response (excludes sensitive data)
   */
  private formatApiKeyResponse(apiKey: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    scopes: unknown;
    rateLimit: number | null;
    lastUsedAt: Date | null;
    createdAt: Date;
    expiresAt: Date | null;
    isActive: boolean;
    description: string | null;
  }): ApiKeyResponse {
    return {
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: this.parseScopes(apiKey.scopes),
      rateLimit: apiKey.rateLimit,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
      isActive: apiKey.isActive,
      description: apiKey.description,
    };
  }
}

export const apiKeyService = new ApiKeyService();
