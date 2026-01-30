/**
 * Fraud Protection Middleware
 *
 * Express middleware that integrates the fraud protection system
 * into the request pipeline.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
import {
  FraudProtectionService,
  type FraudProtectionConfig,
  type RequestContext,
} from '../fraud/index.js';
import { errorResponse, ErrorCodes } from '@bostonia/shared';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      fraudProtection?: {
        trustTier: string;
        riskLevel: string;
        actions: string[];
        delay: number;
      };
    }
  }
}

export interface FraudProtectionMiddlewareOptions {
  redis: Redis;
  enableFingerprinting?: boolean;
  enableTrustScoring?: boolean;
  enableAdaptiveRateLimiting?: boolean;
  enableChallenges?: boolean;
  enablePayloadAnalysis?: boolean;
  enableResponsePolicies?: boolean;
  enableRequestSigning?: boolean;
  captchaSecret?: string;
  skipPaths?: string[];
  skipInternalRequests?: boolean;
  logger?: FraudProtectionConfig['logger'];
}

let fraudService: FraudProtectionService | null = null;

/**
 * Initialize fraud protection service (call once at startup)
 */
export function initializeFraudProtection(options: FraudProtectionMiddlewareOptions): FraudProtectionService {
  fraudService = new FraudProtectionService({
    redis: options.redis,
    enableFingerprinting: options.enableFingerprinting ?? true,
    enableTrustScoring: options.enableTrustScoring ?? true,
    enableAdaptiveRateLimiting: options.enableAdaptiveRateLimiting ?? true,
    enableChallenges: options.enableChallenges ?? true,
    enablePayloadAnalysis: options.enablePayloadAnalysis ?? true,
    enableResponsePolicies: options.enableResponsePolicies ?? true,
    enableRequestSigning: options.enableRequestSigning ?? false,
    captchaSecret: options.captchaSecret,
    logger: options.logger,
  });

  return fraudService;
}

/**
 * Get the fraud protection service instance
 */
export function getFraudProtectionService(): FraudProtectionService | null {
  return fraudService;
}

/**
 * Extract request context from Express request
 */
function extractRequestContext(req: Request): RequestContext {
  const userId = req.headers['x-user-id'] as string | undefined;
  const deviceId = req.headers['x-device-id'] as string | undefined;
  const sessionId = req.headers['x-session-id'] as string | undefined;

  // Extract IP address
  let ipAddress = 'unknown';
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    ipAddress = Array.isArray(forwardedFor)
      ? forwardedFor[0] || 'unknown'
      : forwardedFor.split(',')[0]?.trim() || 'unknown';
  } else if (req.headers['x-real-ip']) {
    ipAddress = req.headers['x-real-ip'] as string;
  } else if (req.ip) {
    ipAddress = req.ip;
  } else if (req.socket?.remoteAddress) {
    ipAddress = req.socket.remoteAddress;
  }

  return {
    userId: userId || null,
    ipAddress,
    deviceId: deviceId || null,
    sessionId: sessionId || null,
    endpoint: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'] || '',
  };
}

/**
 * Main fraud protection middleware
 */
export function fraudProtectionMiddleware(options: FraudProtectionMiddlewareOptions) {
  const {
    skipPaths = ['/health'],
    skipInternalRequests = true,
  } = options;

  // Ensure service is initialized
  if (!fraudService) {
    initializeFraudProtection(options);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip for specified paths
    if (skipPaths.some((path) => req.path.toLowerCase().startsWith(path.toLowerCase()))) {
      return next();
    }

    // Skip for internal service requests
    if (skipInternalRequests && req.headers['x-internal-service-key']) {
      return next();
    }

    if (!fraudService) {
      return next();
    }

    try {
      const context = extractRequestContext(req);

      // Run protection checks
      const result = await fraudService.protectRequest(req, context);

      // Set rate limit headers
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }

      // Attach protection info to request
      req.fraudProtection = {
        trustTier: result.trustTier,
        riskLevel: result.riskLevel,
        actions: result.actions,
        delay: result.delay,
      };

      // Handle blocked requests
      if (!result.allowed) {
        // Check if challenge is required
        if (result.challenge?.required) {
          return res.status(403).json(
            errorResponse(
              ErrorCodes.FORBIDDEN,
              'Security verification required',
              {
                challengeRequired: true,
                challengeType: result.challenge.type,
                challengeId: result.challenge.challengeId,
              }
            )
          );
        }

        return res.status(429).json(
          errorResponse(ErrorCodes.RATE_LIMITED, result.reason || 'Request blocked')
        );
      }

      // Apply delay if required (for suspicious but not blocked requests)
      if (result.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, result.delay));
      }

      next();
    } catch (error) {
      // Log error but don't block request if fraud protection fails
      options.logger?.error({ err: error }, 'Fraud protection error - allowing request');
      next();
    }
  };
}

/**
 * Message protection middleware (for chat endpoints)
 */
export function messageProtectionMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!fraudService) {
      return next();
    }

    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return next();
    }

    const content = req.body?.content;
    if (!content || typeof content !== 'string') {
      return next();
    }

    try {
      // Generate message ID if not provided
      const messageId = req.body?.messageId || `temp-${Date.now()}`;

      const result = await fraudService.protectMessage(
        messageId,
        userId,
        content,
        {
          typingDuration: req.body?.typingDuration,
          editCount: req.body?.editCount,
          pasteEvents: req.body?.pasteEvents,
        }
      );

      // Attach analysis to request for logging
      (req as any).messageAnalysis = result.analysis;
      (req as any).shouldCountForEarnings = result.shouldCountForEarnings;

      if (!result.allowed) {
        return res.status(400).json(
          errorResponse(
            ErrorCodes.VALIDATION_ERROR,
            'Message content not allowed',
            {
              contentType: result.analysis.contentType,
              riskLevel: result.analysis.riskLevel,
            }
          )
        );
      }

      next();
    } catch (error) {
      // Log error but don't block if analysis fails
      next();
    }
  };
}

/**
 * Challenge verification middleware
 */
export function challengeVerificationMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!fraudService) {
      return next();
    }

    const challengeId = req.headers['x-challenge-id'] as string;
    const challengeResponse = req.headers['x-challenge-response'] as string;

    if (!challengeId || !challengeResponse) {
      return next();
    }

    try {
      const identifier =
        (req.headers['x-user-id'] as string) ||
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        'unknown';

      // Determine challenge type from headers
      const challengeType = req.headers['x-challenge-type'] as string;

      let result;

      if (challengeType === 'pow') {
        // Parse PoW solution
        const solution = JSON.parse(challengeResponse);
        result = await fraudService.challenge.verifyPowSolution(
          challengeId,
          identifier,
          solution
        );
      } else if (challengeType === 'captcha') {
        result = await fraudService.challenge.verifyCaptchaResponse(
          challengeId,
          identifier,
          challengeResponse
        );
      } else {
        // Unknown challenge type
        return res.status(400).json(
          errorResponse(ErrorCodes.VALIDATION_ERROR, 'Unknown challenge type')
        );
      }

      if (!result.success) {
        return res.status(403).json(
          errorResponse(
            ErrorCodes.FORBIDDEN,
            'Challenge verification failed',
            result.metadata
          )
        );
      }

      // Challenge passed, continue
      next();
    } catch (error) {
      return res.status(400).json(
        errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid challenge response')
      );
    }
  };
}

/**
 * Request signing verification middleware
 */
export function requestSigningMiddleware(options: { requireSignature?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!fraudService) {
      return next();
    }

    const signature = req.headers['x-request-signature'] as string;
    const timestamp = req.headers['x-request-timestamp'] as string;
    const nonce = req.headers['x-request-nonce'] as string;
    const keyId = req.headers['x-signing-key-id'] as string;

    // Skip if no signature provided and not required
    if (!signature && !options.requireSignature) {
      return next();
    }

    if (!signature || !timestamp || !nonce || !keyId) {
      if (options.requireSignature) {
        return res.status(401).json(
          errorResponse(ErrorCodes.UNAUTHORIZED, 'Request signature required')
        );
      }
      return next();
    }

    try {
      const signedRequest = {
        timestamp: parseInt(timestamp, 10),
        nonce,
        signature,
        publicKeyId: keyId,
        payload: Buffer.from(JSON.stringify(req.body)).toString('base64'),
      };

      const result = await fraudService.requestSigning.verifySignedRequest(signedRequest);

      if (!result.valid) {
        return res.status(401).json(
          errorResponse(ErrorCodes.UNAUTHORIZED, result.reason || 'Invalid request signature')
        );
      }

      // Verify user ID matches signed request
      const requestUserId = req.headers['x-user-id'] as string;
      if (result.userId && requestUserId && result.userId !== requestUserId) {
        return res.status(401).json(
          errorResponse(ErrorCodes.UNAUTHORIZED, 'User ID mismatch in signed request')
        );
      }

      next();
    } catch (error) {
      return res.status(400).json(
        errorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid signature format')
      );
    }
  };
}
