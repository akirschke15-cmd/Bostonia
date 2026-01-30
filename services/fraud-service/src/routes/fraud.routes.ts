import { Router, Request, Response } from 'express';
import { successResponse, errorResponse, ErrorCodes } from '@bostonia/shared';
import { RealtimeDetectionService } from '../services/realtime-detection.js';
import { fraudResponseService } from '../services/response.js';
import { appealService } from '../services/appeal.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const router = Router();
const detectionService = new RealtimeDetectionService(redis);

/**
 * POST /api/fraud/assess
 * Real-time risk assessment for an action.
 */
router.post('/assess', async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, ipAddress, deviceFingerprint, characterId, creatorId, action, metadata } =
      req.body;

    if (!userId || !sessionId || !ipAddress || !action) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    const assessment = await detectionService.assess({
      userId,
      sessionId,
      ipAddress,
      deviceFingerprint,
      characterId,
      creatorId,
      action,
      metadata,
    });

    res.json(successResponse(assessment));
  } catch (error) {
    logger.error({ error }, 'Error in risk assessment');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Risk assessment failed'));
  }
});

/**
 * POST /api/fraud/track/device
 * Track a user's device fingerprint.
 */
router.post('/track/device', async (req: Request, res: Response) => {
  try {
    const { userId, fingerprint } = req.body;

    if (!userId || !fingerprint) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    await detectionService.trackDevice(userId, fingerprint);
    res.json(successResponse({ tracked: true }));
  } catch (error) {
    logger.error({ error }, 'Error tracking device');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Device tracking failed'));
  }
});

/**
 * POST /api/fraud/track/ip
 * Track a user's IP address.
 */
router.post('/track/ip', async (req: Request, res: Response) => {
  try {
    const { userId, ipAddress } = req.body;

    if (!userId || !ipAddress) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    await detectionService.trackIp(userId, ipAddress);
    res.json(successResponse({ tracked: true }));
  } catch (error) {
    logger.error({ error }, 'Error tracking IP');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'IP tracking failed'));
  }
});

/**
 * GET /api/fraud/status/:userId
 * Get fraud status for a user.
 */
router.get('/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [isShadowBanned, strictRateLimits] = await Promise.all([
      fraudResponseService.isShadowBanned(userId),
      fraudResponseService.getStrictRateLimits(userId),
    ]);

    res.json(
      successResponse({
        userId,
        isShadowBanned,
        hasStrictRateLimits: !!strictRateLimits,
        strictRateLimits,
      })
    );
  } catch (error) {
    logger.error({ error }, 'Error getting fraud status');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get fraud status'));
  }
});

// ============================================================================
// APPEAL ENDPOINTS
// ============================================================================

/**
 * POST /api/fraud/appeals
 * Submit a new appeal.
 */
router.post('/appeals', async (req: Request, res: Response) => {
  try {
    const { caseId, userId, contactEmail, appealReason, supportingEvidence } = req.body;

    if (!caseId || !userId || !contactEmail || !appealReason) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    const appealId = await appealService.submitAppeal({
      caseId,
      userId,
      contactEmail,
      appealReason,
      supportingEvidence,
    });

    res.status(201).json(
      successResponse({
        appealId,
        message: 'Appeal submitted successfully. You will receive a confirmation email shortly.',
      })
    );
  } catch (error: any) {
    logger.error({ error }, 'Error submitting appeal');
    res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, error.message));
  }
});

/**
 * GET /api/fraud/appeals
 * List appeals (admin only).
 */
router.get('/appeals', async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? (req.query.status as string).split(',') : undefined;
    const reviewerId = req.query.reviewerId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await appealService.getAppeals({
      status: status as any,
      reviewerId,
      page,
      limit,
    });

    res.json(successResponse(result));
  } catch (error) {
    logger.error({ error }, 'Error listing appeals');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list appeals'));
  }
});

/**
 * GET /api/fraud/appeals/:id
 * Get appeal details.
 */
router.get('/appeals/:id', async (req: Request, res: Response) => {
  try {
    const appeal = await appealService.getAppeal(req.params.id);

    if (!appeal) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Appeal not found'));
    }

    res.json(successResponse(appeal));
  } catch (error) {
    logger.error({ error }, 'Error getting appeal');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get appeal'));
  }
});

/**
 * POST /api/fraud/appeals/:id/assign
 * Assign an appeal to a reviewer (admin only).
 */
router.post('/appeals/:id/assign', async (req: Request, res: Response) => {
  try {
    const { reviewerId } = req.body;

    if (!reviewerId) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Reviewer ID required'));
    }

    await appealService.assignAppeal(req.params.id, reviewerId);
    res.json(successResponse({ message: 'Appeal assigned successfully' }));
  } catch (error: any) {
    logger.error({ error }, 'Error assigning appeal');
    res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, error.message));
  }
});

/**
 * POST /api/fraud/appeals/:id/decide
 * Decide on an appeal (admin only).
 */
router.post('/appeals/:id/decide', async (req: Request, res: Response) => {
  try {
    const { reviewerId, decision, decisionReason, actionsToReverse, compensationAmount, internalNotes } =
      req.body;

    if (!reviewerId || !decision || !decisionReason) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    await appealService.reviewAppeal({
      appealId: req.params.id,
      reviewerId,
      decision,
      decisionReason,
      actionsToReverse,
      compensationAmount,
      internalNotes,
    });

    res.json(successResponse({ message: 'Appeal decision recorded' }));
  } catch (error: any) {
    logger.error({ error }, 'Error deciding appeal');
    res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, error.message));
  }
});

/**
 * POST /api/fraud/appeals/:id/evidence
 * Add evidence to an appeal.
 */
router.post('/appeals/:id/evidence', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { type, content, description } = req.body;

    if (!userId || !type || !content) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    await appealService.addEvidence(req.params.id, userId, { type, content, description });
    res.json(successResponse({ message: 'Evidence added successfully' }));
  } catch (error: any) {
    logger.error({ error }, 'Error adding evidence');
    res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, error.message));
  }
});

/**
 * POST /api/fraud/appeals/:id/compensation
 * Respond to compensation offer.
 */
router.post('/appeals/:id/compensation', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { accepted } = req.body;

    if (!userId || typeof accepted !== 'boolean') {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Missing required fields'));
    }

    await appealService.respondToCompensation(req.params.id, userId, accepted);
    res.json(successResponse({ message: accepted ? 'Compensation accepted' : 'Compensation declined' }));
  } catch (error: any) {
    logger.error({ error }, 'Error responding to compensation');
    res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, error.message));
  }
});

export default router;
