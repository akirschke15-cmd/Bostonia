/**
 * Fraud Protection Integration Example
 *
 * This file demonstrates how to integrate the fraud protection system
 * into the chat service. It can be used as a reference for implementation.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import pino from 'pino';

import {
  FraudProtectionService,
  type FraudProtectionConfig,
  type RequestContext,
  type TrustTier,
} from './index.js';

import {
  fraudProtectionMiddleware,
  messageProtectionMiddleware,
  challengeVerificationMiddleware,
  initializeFraudProtection,
  getFraudProtectionService,
} from '../middleware/index.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

const logger = pino({ level: 'info' });
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Initialize the fraud protection service
const fraudProtection = initializeFraudProtection({
  redis,
  enableFingerprinting: true,
  enableTrustScoring: true,
  enableAdaptiveRateLimiting: true,
  enableChallenges: true,
  enablePayloadAnalysis: true,
  enableResponsePolicies: true,
  enableRequestSigning: false, // Enable in production
  captchaSecret: process.env.RECAPTCHA_SECRET,
  skipPaths: ['/health', '/api/public'],
  skipInternalRequests: true,
  logger: {
    info: (obj, msg) => logger.info(obj, msg),
    warn: (obj, msg) => logger.warn(obj, msg),
    error: (obj, msg) => logger.error(obj, msg),
  },
});

// =============================================================================
// EXPRESS INTEGRATION
// =============================================================================

const app = express();
app.use(express.json());

// Apply fraud protection middleware globally
app.use(
  fraudProtectionMiddleware({
    redis,
    skipPaths: ['/health', '/api/auth/login', '/api/auth/register'],
    logger: {
      info: (obj, msg) => logger.info(obj, msg),
      warn: (obj, msg) => logger.warn(obj, msg),
      error: (obj, msg) => logger.error(obj, msg),
    },
  })
);

// Challenge verification for protected endpoints
app.use('/api/protected', challengeVerificationMiddleware());

// Message content protection for chat endpoints
app.use('/api/conversations/:id/messages', messageProtectionMiddleware());

// =============================================================================
// EXAMPLE ENDPOINTS
// =============================================================================

// Health check (excluded from fraud protection)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Get trust score for current user
app.get('/api/fraud/trust/score', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  const trustScore = await service.trustScore.getTrustScore(userId);

  if (!trustScore) {
    // Calculate initial trust score
    // In production, fetch user context from database
    const context = {
      userId,
      accountCreatedAt: new Date(),
      emailVerified: false,
      hasPaymentMethod: false,
      subscriptionTier: 'FREE',
      totalSpent: 0,
      conversationCount: 0,
      messageCount: 0,
      reportCount: 0,
      violationCount: 0,
    };

    const calculated = await service.trustScore.calculateTrustScore(context);
    return res.json({ success: true, data: calculated });
  }

  res.json({ success: true, data: trustScore });
});

// Request a challenge
app.post('/api/fraud/challenge/request', async (req, res) => {
  const { type = 'pow', context: ctx } = req.body;
  const userId = req.headers['x-user-id'] as string | undefined;
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  if (type === 'pow') {
    const challenge = await service.challenge.generatePowChallenge(
      userId || null,
      ip,
      5 // Default difficulty
    );
    return res.json({ success: true, data: challenge });
  }

  if (type === 'captcha') {
    const challenge = await service.challenge.generateCaptchaChallenge(
      userId || null,
      ip
    );
    return res.json({ success: true, data: challenge });
  }

  res.status(400).json({ error: 'Invalid challenge type' });
});

// Verify challenge
app.post('/api/fraud/challenge/verify', async (req, res) => {
  const { challengeId, type, solution } = req.body;
  const identifier =
    (req.headers['x-user-id'] as string) ||
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  let result;

  if (type === 'pow') {
    result = await service.challenge.verifyPowSolution(
      challengeId,
      identifier,
      solution
    );
  } else if (type === 'captcha') {
    result = await service.challenge.verifyCaptchaResponse(
      challengeId,
      identifier,
      solution
    );
  } else {
    return res.status(400).json({ error: 'Invalid challenge type' });
  }

  if (!result.success) {
    return res.status(403).json({
      success: false,
      error: 'Challenge verification failed',
      metadata: result.metadata,
    });
  }

  res.json({ success: true, data: { verified: true } });
});

// Register device fingerprint
app.post('/api/fraud/fingerprint/device', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  const fingerprint = await service.fingerprint.processDeviceFingerprint(
    userId,
    req.body
  );

  const verification = await service.fingerprint.verifyDeviceFingerprint(
    userId,
    fingerprint
  );

  res.json({
    success: true,
    data: {
      deviceId: fingerprint.deviceId,
      isKnownDevice: verification.isKnown,
      similarity: verification.similarity,
    },
  });
});

// Protected message sending with fraud protection
app.post('/api/conversations/:id/messages', async (req, res) => {
  const userId = req.headers['x-user-id'] as string;
  const conversationId = req.params.id;
  const { content } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fraud protection middleware has already analyzed the message
  // Access analysis from request
  const messageAnalysis = (req as any).messageAnalysis;
  const shouldCount = (req as any).shouldCountForEarnings !== false;

  // Log analysis results
  if (messageAnalysis) {
    logger.info(
      {
        conversationId,
        userId,
        contentType: messageAnalysis.contentType,
        riskLevel: messageAnalysis.riskLevel,
        spamScore: messageAnalysis.spamScore,
        automationScore: messageAnalysis.automationScore,
        shouldCountForEarnings: shouldCount,
      },
      'Message analysis complete'
    );
  }

  // Process message (your existing logic)
  // ...

  res.json({
    success: true,
    data: {
      messageId: 'msg_123',
      content,
      // Include moderation metadata in response
      moderation: {
        analyzed: true,
        contentType: messageAnalysis?.contentType || 'NORMAL',
      },
    },
  });
});

// =============================================================================
// WEBSOCKET INTEGRATION
// =============================================================================

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// WebSocket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const deviceId = socket.handshake.auth.deviceId || 'unknown';

    // Verify JWT token (your existing logic)
    const userId = 'user_123'; // Extract from token

    // Get client IP
    const ip =
      socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      socket.handshake.address ||
      'unknown';

    const service = getFraudProtectionService();
    if (!service) {
      return next();
    }

    // Check WebSocket connection protection
    const result = await service.protectWebSocketConnection(
      socket,
      userId,
      deviceId,
      ip
    );

    if (!result.allowed) {
      return next(new Error(result.reason || 'Connection denied'));
    }

    // Attach user info to socket
    (socket as any).userId = userId;
    (socket as any).deviceId = deviceId;

    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
});

// WebSocket connection handler
io.on('connection', async (socket) => {
  const userId = (socket as any).userId;
  const deviceId = (socket as any).deviceId;

  logger.info({ socketId: socket.id, userId }, 'WebSocket connected');

  // Handle chat messages
  socket.on('chat:message', async (data: { conversationId: string; content: string }) => {
    const service = getFraudProtectionService();
    if (!service) {
      return socket.emit('chat:error', { message: 'Service unavailable' });
    }

    // Check message rate limit
    const rateLimitResult = await service.protectWebSocketMessage(
      socket.id,
      data.content.length
    );

    if (!rateLimitResult.allowed) {
      return socket.emit('chat:error', {
        message: 'Rate limit exceeded',
        reason: rateLimitResult.reason,
      });
    }

    // Analyze message content
    const messageId = `msg_${Date.now()}`;
    const protection = await service.protectMessage(
      messageId,
      userId,
      data.content
    );

    if (!protection.allowed) {
      return socket.emit('chat:error', {
        message: 'Message blocked',
        contentType: protection.analysis.contentType,
        riskLevel: protection.analysis.riskLevel,
      });
    }

    // Check if shadow banned
    if (protection.policyApplied === 'SHADOW_BANNED') {
      // Accept message but don't actually process it
      // Send fake success response
      socket.emit('chat:message:sent', {
        messageId,
        content: data.content,
        timestamp: new Date(),
      });

      logger.info(
        { userId, messageId, reason: 'shadow_banned' },
        'Shadow banned message accepted'
      );

      return;
    }

    // Process message normally
    // ... your existing message handling logic

    socket.emit('chat:message:sent', {
      messageId,
      content: data.content,
      timestamp: new Date(),
      shouldCountForEarnings: protection.shouldCountForEarnings,
    });
  });

  // Handle heartbeat
  socket.on('ping', async () => {
    const service = getFraudProtectionService();
    if (!service) {
      return socket.emit('pong');
    }

    const heartbeatResult = await service.websocket.validateHeartbeat(
      socket.id,
      30000 // Expected interval: 30 seconds
    );

    if (!heartbeatResult.valid) {
      logger.warn(
        { socketId: socket.id, userId, reason: heartbeatResult.reason },
        'Invalid heartbeat'
      );
    }

    socket.emit('pong');
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    const service = getFraudProtectionService();
    if (service) {
      await service.websocket.onDisconnection(socket.id);
    }

    logger.info({ socketId: socket.id, userId }, 'WebSocket disconnected');
  });
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

// Get fraud events (admin only)
app.get('/api/admin/fraud/events', async (req, res) => {
  const adminId = req.headers['x-user-id'] as string;
  // Verify admin role (your existing logic)

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  const userId = req.query.userId as string | undefined;

  if (userId) {
    const events = await service.getUserFraudEvents(userId);
    return res.json({ success: true, data: events });
  }

  // Return recent events across all users
  // This would require additional implementation for pagination
  res.json({ success: true, data: [] });
});

// Apply manual trust adjustment (admin only)
app.post('/api/admin/fraud/trust/adjust', async (req, res) => {
  const adminId = req.headers['x-user-id'] as string;
  // Verify admin role (your existing logic)

  const { userId, adjustment, reason } = req.body;

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  const updatedScore = await service.trustScore.adjustTrustScore(
    userId,
    adjustment,
    reason,
    adminId
  );

  res.json({ success: true, data: updatedScore });
});

// Apply response policy (admin only)
app.post('/api/admin/fraud/policy/apply', async (req, res) => {
  const adminId = req.headers['x-user-id'] as string;
  // Verify admin role (your existing logic)

  const { userId, policyType, reason, duration } = req.body;

  const service = getFraudProtectionService();
  if (!service) {
    return res.status(500).json({ error: 'Service not initialized' });
  }

  const policy = await service.responsePolicy.applyPolicy(
    userId,
    policyType,
    `Admin action: ${reason} (by ${adminId})`,
    duration
  );

  res.json({ success: true, data: policy });
});

// =============================================================================
// STARTUP
// =============================================================================

const PORT = parseInt(process.env.PORT || '3004', 10);

httpServer.listen(PORT, () => {
  logger.info(`Fraud-protected chat service listening on port ${PORT}`);
});

export { app, io, fraudProtection };
