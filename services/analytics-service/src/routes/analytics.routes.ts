/**
 * Analytics API Routes
 *
 * Endpoints for receiving behavioral data from clients and
 * querying fraud scores for admin dashboards.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const eventSchema = z.object({
  eventType: z.string(),
  timestamp: z.number(),
  sessionId: z.string(),
  userId: z.string().optional(),
  payload: z.record(z.unknown()),
  metadata: z.object({
    userAgent: z.string(),
    screenResolution: z.string().optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  }),
});

const eventBatchSchema = z.object({
  events: z.array(eventSchema),
  sessionId: z.string(),
  userId: z.string().optional(),
  timestamp: z.number(),
});

const fraudScoreQuerySchema = z.object({
  userId: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['overallScore', 'lastCalculated', 'confidence']).default('overallScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export function createAnalyticsRouter(dependencies: {
  analyticsPipeline: any; // AnalyticsPipelineService
  db: any; // Database client
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
}): Router {
  const router = Router();
  const { analyticsPipeline, db, requireAuth, requireAdmin } = dependencies;

  /**
   * POST /events
   * Receive behavioral events from client
   * Rate limited, accepts anonymous or authenticated requests
   */
  router.post('/events', async (req: Request, res: Response) => {
    try {
      const validatedData = eventBatchSchema.parse(req.body);

      // Get user ID from auth if available
      const userId = (req as any).user?.id || validatedData.userId || 'anonymous';

      // Privacy: Hash IP address
      const ipHash = hashString(req.ip || 'unknown');

      // Add IP hash to events
      const eventsWithIp = validatedData.events.map((event) => ({
        ...event,
        id: generateId(),
        userId,
        timestamp: new Date(event.timestamp),
        metadata: {
          ...event.metadata,
          ipHash,
        },
      }));

      // Ingest events
      const result = await analyticsPipeline.ingestEvents({
        userId,
        sessionId: validatedData.sessionId,
        events: eventsWithIp,
        timestamp: validatedData.timestamp,
      });

      // Return minimal response for performance
      res.status(202).json({
        success: true,
        processed: result.processed,
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid event data',
          details: error.errors,
        });
      }
      console.error('Error ingesting events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process events',
      });
    }
  });

  /**
   * POST /composition
   * Receive message composition analytics
   */
  router.post('/composition', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const composition = req.body;

      await analyticsPipeline.processComposition(userId, {
        id: generateId(),
        userId,
        ...composition,
        timestamp: new Date(),
      });

      res.status(202).json({ success: true });

    } catch (error) {
      console.error('Error processing composition:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process composition',
      });
    }
  });

  /**
   * POST /session/end
   * End a session and finalize analytics
   */
  router.post('/session/end', async (req: Request, res: Response) => {
    try {
      const { sessionId, ...sessionData } = req.body;
      const userId = (req as any).user?.id || sessionData.userId || 'anonymous';

      const profile = await analyticsPipeline.endSession(userId, sessionId, sessionData);

      res.json({
        success: true,
        data: {
          sessionId: profile.id,
          fraudScore: profile.fraudScore,
        },
      });

    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to end session',
      });
    }
  });

  // ===========================================================================
  // ADMIN ENDPOINTS
  // ===========================================================================

  /**
   * GET /admin/scores
   * Query fraud scores (admin only)
   */
  router.get('/admin/scores', requireAdmin, async (req: Request, res: Response) => {
    try {
      const query = fraudScoreQuerySchema.parse(req.query);

      const where: any = {};
      if (query.userId) {
        where.userId = query.userId;
      }
      if (query.riskLevel) {
        where.riskLevel = query.riskLevel;
      }
      if (query.minScore !== undefined || query.maxScore !== undefined) {
        where.overallScore = {};
        if (query.minScore !== undefined) {
          where.overallScore.gte = query.minScore;
        }
        if (query.maxScore !== undefined) {
          where.overallScore.lte = query.maxScore;
        }
      }

      const [scores, total] = await Promise.all([
        db.userFraudScore.findMany({
          where,
          orderBy: { [query.sortBy]: query.sortOrder },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                createdAt: true,
              },
            },
          },
        }),
        db.userFraudScore.count({ where }),
      ]);

      res.json({
        success: true,
        data: scores,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors,
        });
      }
      console.error('Error querying scores:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query scores',
      });
    }
  });

  /**
   * GET /admin/scores/:userId
   * Get detailed fraud score for a user
   */
  router.get('/admin/scores/:userId', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const [score, typingProfile, sessions, fingerprint] = await Promise.all([
        db.userFraudScore.findUnique({
          where: { userId },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
                status: true,
                createdAt: true,
                lastLoginAt: true,
              },
            },
          },
        }),
        db.userTypingProfile.findUnique({ where: { userId } }),
        db.sessionProfile.findMany({
          where: { userId },
          orderBy: { timestamp: 'desc' },
          take: 10,
        }),
        db.userBehavioralFingerprint.findUnique({ where: { userId } }),
      ]);

      if (!score) {
        return res.status(404).json({
          success: false,
          error: 'Fraud score not found',
        });
      }

      res.json({
        success: true,
        data: {
          score,
          profiles: {
            typing: typingProfile,
            fingerprint,
          },
          recentSessions: sessions,
        },
      });

    } catch (error) {
      console.error('Error fetching user score:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch score',
      });
    }
  });

  /**
   * GET /admin/clusters
   * Get suspicious user clusters
   */
  router.get('/admin/clusters', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, minRiskScore } = req.query;

      const where: any = {};
      if (status) {
        where.status = status;
      }
      if (minRiskScore) {
        where.clusterRiskScore = { gte: Number(minRiskScore) };
      }

      const clusters = await db.suspiciousCluster.findMany({
        where,
        orderBy: { clusterRiskScore: 'desc' },
        take: 50,
      });

      res.json({
        success: true,
        data: clusters,
      });

    } catch (error) {
      console.error('Error fetching clusters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch clusters',
      });
    }
  });

  /**
   * GET /admin/collusion-rings
   * Get detected collusion rings
   */
  router.get('/admin/collusion-rings', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, creatorId } = req.query;

      const where: any = {};
      if (status) {
        where.status = status;
      }
      if (creatorId) {
        where.creatorId = creatorId;
      }

      const rings = await db.collusionRingDetection.findMany({
        where,
        orderBy: { confidenceScore: 'desc' },
        take: 50,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: rings,
      });

    } catch (error) {
      console.error('Error fetching collusion rings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch collusion rings',
      });
    }
  });

  /**
   * POST /admin/scores/:userId/action
   * Take action on a user based on fraud score
   */
  router.post('/admin/scores/:userId/action', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { action, reason } = req.body;
      const adminId = (req as any).user?.id;

      const validActions = ['clear', 'monitor', 'restrict', 'suspend', 'ban'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
        });
      }

      // Get current score
      const currentScore = await db.userFraudScore.findUnique({
        where: { userId },
      });

      if (!currentScore) {
        return res.status(404).json({
          success: false,
          error: 'Fraud score not found',
        });
      }

      // Update score with action
      const actionRecord = {
        action,
        reason,
        by: adminId,
        timestamp: new Date().toISOString(),
      };

      const updatedActions = [...(currentScore.actionsTaken || []), actionRecord];

      await db.userFraudScore.update({
        where: { userId },
        data: {
          actionsTaken: updatedActions,
          recommendedAction: action === 'clear' ? 'none' : action,
        },
      });

      // Apply action to user account
      if (action === 'ban' || action === 'suspend') {
        await db.user.update({
          where: { id: userId },
          data: {
            status: action === 'ban' ? 'DELETED' : 'SUSPENDED',
          },
        });
      }

      res.json({
        success: true,
        data: {
          userId,
          action,
          appliedAt: new Date(),
        },
      });

    } catch (error) {
      console.error('Error applying action:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to apply action',
      });
    }
  });

  /**
   * GET /admin/dashboard/stats
   * Get fraud detection dashboard statistics
   */
  router.get('/admin/dashboard/stats', requireAdmin, async (req: Request, res: Response) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        totalScores,
        highRiskCount,
        criticalRiskCount,
        recentClusters,
        recentRings,
        riskDistribution,
      ] = await Promise.all([
        db.userFraudScore.count(),
        db.userFraudScore.count({ where: { riskLevel: 'high' } }),
        db.userFraudScore.count({ where: { riskLevel: 'critical' } }),
        db.suspiciousCluster.count({
          where: { detectedAt: { gte: thirtyDaysAgo } },
        }),
        db.collusionRingDetection.count({
          where: { detectedAt: { gte: thirtyDaysAgo } },
        }),
        db.userFraudScore.groupBy({
          by: ['riskLevel'],
          _count: { userId: true },
        }),
      ]);

      // Get score trend (average score over time)
      const scoreHistory = await db.userFraudScore.findMany({
        select: {
          lastCalculated: true,
          overallScore: true,
        },
        where: {
          lastCalculated: { gte: thirtyDaysAgo },
        },
        orderBy: { lastCalculated: 'asc' },
      });

      // Aggregate by day
      const dailyAverages: Record<string, { sum: number; count: number }> = {};
      for (const record of scoreHistory) {
        const day = record.lastCalculated.toISOString().split('T')[0];
        if (!dailyAverages[day]) {
          dailyAverages[day] = { sum: 0, count: 0 };
        }
        dailyAverages[day].sum += record.overallScore;
        dailyAverages[day].count++;
      }

      const scoreTrend = Object.entries(dailyAverages).map(([date, data]) => ({
        date,
        averageScore: data.sum / data.count,
      }));

      res.json({
        success: true,
        data: {
          totals: {
            usersScored: totalScores,
            highRisk: highRiskCount,
            criticalRisk: criticalRiskCount,
            clustersDetected: recentClusters,
            collusionRingsDetected: recentRings,
          },
          riskDistribution: riskDistribution.map((r) => ({
            level: r.riskLevel,
            count: r._count.userId,
          })),
          scoreTrend,
        },
      });

    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
      });
    }
  });

  return router;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
