/**
 * Batch Analyzer Worker
 *
 * Runs periodic batch analysis jobs for:
 * - Network graph analysis and cluster detection
 * - Collusion ring detection
 * - Fingerprint updates
 * - Score recalculation
 * - Data cleanup and maintenance
 */

import { networkAnalyzer } from '../detectors/network-analyzer.js';
import { conversationQualityAnalyzer } from '../detectors/conversation-quality-analyzer.js';
import { fraudScoringService } from '../services/fraud-scoring.service.js';

// =============================================================================
// TYPES
// =============================================================================

interface BatchJobConfig {
  // Cluster detection
  clusterDetectionInterval: number; // ms
  minUsersForClustering: number;

  // Collusion detection
  collusionDetectionInterval: number;

  // Score updates
  scoreUpdateInterval: number;
  staleScoreThresholdHours: number;

  // Conversation quality
  qualityAnalysisInterval: number;
  minConversationsForAnalysis: number;

  // Cleanup
  cleanupInterval: number;
  eventRetentionDays: number;
}

interface JobResult {
  job: string;
  success: boolean;
  duration: number;
  processed: number;
  errors: string[];
  details?: Record<string, unknown>;
}

// Mock database interface
interface DatabaseClient {
  user: any;
  userFraudScore: any;
  suspiciousCluster: any;
  collusionRingDetection: any;
  userInteractionEdge: any;
  sessionProfile: any;
  conversationQualityMetric: any;
  conversation: any;
  message: any;
  character: any;
  behavioralEvent: any;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: BatchJobConfig = {
  clusterDetectionInterval: 6 * 60 * 60 * 1000, // 6 hours
  minUsersForClustering: 100,

  collusionDetectionInterval: 12 * 60 * 60 * 1000, // 12 hours

  scoreUpdateInterval: 1 * 60 * 60 * 1000, // 1 hour
  staleScoreThresholdHours: 24,

  qualityAnalysisInterval: 4 * 60 * 60 * 1000, // 4 hours
  minConversationsForAnalysis: 5,

  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
  eventRetentionDays: 90,
};

// =============================================================================
// BATCH ANALYZER CLASS
// =============================================================================

export class BatchAnalyzer {
  private config: BatchJobConfig;
  private db: DatabaseClient;
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning: boolean = false;
  private lastRunTimes: Map<string, Date> = new Map();

  constructor(db: DatabaseClient, config: Partial<BatchJobConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start all batch jobs
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('Batch analyzer already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting batch analyzer...');

    // Schedule jobs
    this.scheduleJob('clusterDetection', this.config.clusterDetectionInterval, () =>
      this.runClusterDetection()
    );

    this.scheduleJob('collusionDetection', this.config.collusionDetectionInterval, () =>
      this.runCollusionDetection()
    );

    this.scheduleJob('scoreUpdate', this.config.scoreUpdateInterval, () =>
      this.runScoreUpdates()
    );

    this.scheduleJob('qualityAnalysis', this.config.qualityAnalysisInterval, () =>
      this.runQualityAnalysis()
    );

    this.scheduleJob('cleanup', this.config.cleanupInterval, () =>
      this.runCleanup()
    );

    // Run initial analysis after startup
    setTimeout(() => {
      this.runInitialAnalysis();
    }, 10000); // 10 second delay

    console.log('Batch analyzer started');
  }

  /**
   * Stop all batch jobs
   */
  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      console.log(`Stopped job: ${name}`);
    }

    this.timers.clear();
    console.log('Batch analyzer stopped');
  }

  /**
   * Run a specific job manually
   */
  public async runJob(jobName: string): Promise<JobResult> {
    switch (jobName) {
      case 'clusterDetection':
        return this.runClusterDetection();
      case 'collusionDetection':
        return this.runCollusionDetection();
      case 'scoreUpdate':
        return this.runScoreUpdates();
      case 'qualityAnalysis':
        return this.runQualityAnalysis();
      case 'cleanup':
        return this.runCleanup();
      default:
        return {
          job: jobName,
          success: false,
          duration: 0,
          processed: 0,
          errors: [`Unknown job: ${jobName}`],
        };
    }
  }

  /**
   * Get job status
   */
  public getStatus(): Record<string, { lastRun: Date | null; isScheduled: boolean }> {
    const status: Record<string, { lastRun: Date | null; isScheduled: boolean }> = {};

    const jobNames = ['clusterDetection', 'collusionDetection', 'scoreUpdate', 'qualityAnalysis', 'cleanup'];

    for (const name of jobNames) {
      status[name] = {
        lastRun: this.lastRunTimes.get(name) || null,
        isScheduled: this.timers.has(name),
      };
    }

    return status;
  }

  // ===========================================================================
  // JOB IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Cluster Detection Job
   * Analyzes user network for suspicious clusters
   */
  private async runClusterDetection(): Promise<JobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      console.log('Running cluster detection...');

      // Get all users with their interaction data
      const users = await this.db.user.findMany({
        select: {
          id: true,
          createdAt: true,
        },
        where: {
          status: 'ACTIVE',
        },
      });

      if (users.length < this.config.minUsersForClustering) {
        return {
          job: 'clusterDetection',
          success: true,
          duration: Date.now() - startTime,
          processed: 0,
          errors: [],
          details: { reason: 'Not enough users for clustering' },
        };
      }

      // Get session data for each user
      const userNodes = await Promise.all(
        users.map(async (user) => {
          const sessions = await this.db.sessionProfile.findMany({
            where: { userId: user.id },
            orderBy: { timestamp: 'desc' },
            take: 30,
          });

          // Calculate hourly activity
          const hourlyActivity = new Array(24).fill(0);
          for (const session of sessions) {
            hourlyActivity[session.hourOfDay]++;
          }

          // Get unique IPs and devices
          const ipHashes = [...new Set(sessions.map((s) => s.ipHash))];
          const deviceFingerprints = [...new Set(sessions.map((s) => s.deviceFingerprint))];

          return {
            userId: user.id,
            createdAt: user.createdAt,
            ipHashes,
            deviceFingerprints,
            totalSpend: 0, // Would come from payment data
            totalMessages: sessions.reduce((sum, s) => sum + s.messagessSent, 0),
            conversationCount: 0,
            activityHours: hourlyActivity,
            behavioralVector: [], // Would come from fingerprint
          };
        })
      );

      // Get interaction edges
      const edges = await this.db.userInteractionEdge.findMany();

      // Get creator nodes
      const creators = await this.db.user.findMany({
        where: { role: 'CREATOR' },
        include: {
          characters: {
            select: { id: true },
          },
        },
      });

      const creatorNodes = creators.map((c) => ({
        creatorId: c.id,
        characterIds: c.characters.map((ch: any) => ch.id),
        totalRevenue: 0,
        uniqueUsers: 0,
        newAccountRatio: 0,
      }));

      // Build graph and detect clusters
      const graph = networkAnalyzer.buildGraph(edges, userNodes, creatorNodes);
      const clusterResult = networkAnalyzer.detectClusters(graph);

      processed = userNodes.length;

      // Store suspicious clusters
      for (const cluster of clusterResult.clusters) {
        if (cluster.clusterRiskScore > 30) {
          await this.db.suspiciousCluster.create({
            data: cluster,
          });
        }
      }

      this.lastRunTimes.set('clusterDetection', new Date());

      return {
        job: 'clusterDetection',
        success: true,
        duration: Date.now() - startTime,
        processed,
        errors,
        details: {
          totalUsers: userNodes.length,
          clustersFound: clusterResult.clusters.length,
          suspiciousClusters: clusterResult.clusters.filter((c) => c.clusterRiskScore > 50).length,
          outliers: clusterResult.outliers.length,
        },
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        job: 'clusterDetection',
        success: false,
        duration: Date.now() - startTime,
        processed,
        errors,
      };
    }
  }

  /**
   * Collusion Detection Job
   * Analyzes creator-user relationships for fraud patterns
   */
  private async runCollusionDetection(): Promise<JobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      console.log('Running collusion detection...');

      // Get suspicious clusters
      const clusters = await this.db.suspiciousCluster.findMany({
        where: {
          status: 'pending_review',
          clusterRiskScore: { gte: 40 },
        },
      });

      // Get creators
      const creators = await this.db.user.findMany({
        where: { role: 'CREATOR' },
        include: {
          characters: true,
        },
      });

      // Get all users
      const users = await this.db.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, createdAt: true },
      });

      // Get sessions for user data
      const userSessions = await this.db.sessionProfile.findMany({
        orderBy: { timestamp: 'desc' },
      });

      // Build user nodes
      const userMap = new Map<string, any>();
      for (const user of users) {
        const sessions = userSessions.filter((s) => s.userId === user.id).slice(0, 30);
        const hourlyActivity = new Array(24).fill(0);
        for (const session of sessions) {
          hourlyActivity[session.hourOfDay]++;
        }

        userMap.set(user.id, {
          userId: user.id,
          createdAt: user.createdAt,
          ipHashes: [...new Set(sessions.map((s) => s.ipHash))],
          deviceFingerprints: [...new Set(sessions.map((s) => s.deviceFingerprint))],
          totalSpend: 0,
          totalMessages: sessions.reduce((sum, s) => sum + s.messagessSent, 0),
          conversationCount: 0,
          activityHours: hourlyActivity,
          behavioralVector: [],
        });
      }

      // Get edges
      const edges = await this.db.userInteractionEdge.findMany();

      // Build creator nodes
      const creatorNodes = creators.map((c) => ({
        creatorId: c.id,
        characterIds: c.characters.map((ch) => ch.id),
        totalRevenue: 0,
        uniqueUsers: edges.filter((e) => e.creatorId === c.id).length,
        newAccountRatio: 0,
      }));

      // Build graph
      const graph = {
        users: userMap,
        creators: new Map(creatorNodes.map((c) => [c.creatorId, c])),
        edges,
      };

      // Detect collusion rings
      const rings = networkAnalyzer.detectCollusionRings(graph, clusters);

      processed = creators.length;

      // Store detected rings
      for (const ring of rings) {
        await this.db.collusionRingDetection.create({
          data: ring,
        });
      }

      this.lastRunTimes.set('collusionDetection', new Date());

      return {
        job: 'collusionDetection',
        success: true,
        duration: Date.now() - startTime,
        processed,
        errors,
        details: {
          creatorsAnalyzed: creators.length,
          clustersConsidered: clusters.length,
          ringsDetected: rings.length,
        },
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        job: 'collusionDetection',
        success: false,
        duration: Date.now() - startTime,
        processed,
        errors,
      };
    }
  }

  /**
   * Score Update Job
   * Recalculates fraud scores for users with stale data
   */
  private async runScoreUpdates(): Promise<JobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      console.log('Running score updates...');

      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - this.config.staleScoreThresholdHours);

      // Find users with stale or missing scores
      const usersNeedingUpdate = await this.db.user.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            {
              fraudScore: null,
            },
            {
              fraudScore: {
                lastCalculated: { lt: staleThreshold },
              },
            },
          ],
        },
        select: { id: true },
        take: 100, // Process in batches
      });

      for (const user of usersNeedingUpdate) {
        try {
          // Gather data
          const [typingProfile, sessions, fingerprint] = await Promise.all([
            this.db.userTypingProfile?.findUnique({ where: { userId: user.id } }),
            this.db.sessionProfile.findMany({
              where: { userId: user.id },
              orderBy: { timestamp: 'desc' },
              take: 30,
            }),
            this.db.userBehavioralFingerprint?.findUnique({ where: { userId: user.id } }),
          ]);

          // Calculate score
          const score = await fraudScoringService.calculateScore({
            userId: user.id,
            typingProfile: typingProfile || undefined,
            sessionProfiles: sessions,
            fingerprint: fingerprint || undefined,
          });

          // Store score
          await this.db.userFraudScore.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              ...this.flattenScore(score),
            },
            update: this.flattenScore(score),
          });

          processed++;

        } catch (userError) {
          errors.push(`User ${user.id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);
        }
      }

      this.lastRunTimes.set('scoreUpdate', new Date());

      return {
        job: 'scoreUpdate',
        success: errors.length < processed / 2,
        duration: Date.now() - startTime,
        processed,
        errors,
        details: {
          usersNeeding: usersNeedingUpdate.length,
          usersUpdated: processed,
        },
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        job: 'scoreUpdate',
        success: false,
        duration: Date.now() - startTime,
        processed,
        errors,
      };
    }
  }

  /**
   * Quality Analysis Job
   * Analyzes conversation quality for all users
   */
  private async runQualityAnalysis(): Promise<JobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      console.log('Running quality analysis...');

      // Find conversations without quality metrics
      const conversations = await this.db.conversation.findMany({
        where: {
          messageCount: { gte: this.config.minConversationsForAnalysis },
          qualityMetric: null,
        },
        include: {
          character: true,
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
        take: 50,
      });

      for (const conversation of conversations) {
        try {
          const messages = conversation.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }));

          const character = conversation.character ? {
            id: conversation.character.id,
            name: conversation.character.name,
            systemPrompt: conversation.character.systemPrompt,
            traits: conversation.character.traits || [],
            category: conversation.character.category,
          } : undefined;

          const analysis = conversationQualityAnalyzer.analyzeConversation(messages, character);

          await this.db.conversationQualityMetric.create({
            data: {
              id: `cq_${conversation.id}`,
              conversationId: conversation.id,
              userId: conversation.userId,
              characterId: conversation.characterId,
              ...analysis.metrics,
              timestamp: new Date(),
            },
          });

          processed++;

        } catch (convoError) {
          errors.push(`Conversation ${conversation.id}: ${convoError instanceof Error ? convoError.message : 'Unknown error'}`);
        }
      }

      this.lastRunTimes.set('qualityAnalysis', new Date());

      return {
        job: 'qualityAnalysis',
        success: true,
        duration: Date.now() - startTime,
        processed,
        errors,
        details: {
          conversationsAnalyzed: processed,
        },
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        job: 'qualityAnalysis',
        success: false,
        duration: Date.now() - startTime,
        processed,
        errors,
      };
    }
  }

  /**
   * Cleanup Job
   * Removes old data and performs maintenance
   */
  private async runCleanup(): Promise<JobResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let processed = 0;

    try {
      console.log('Running cleanup...');

      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - this.config.eventRetentionDays);

      // Delete old behavioral events
      const deletedEvents = await this.db.behavioralEvent.deleteMany({
        where: {
          timestamp: { lt: retentionDate },
        },
      });

      processed += deletedEvents.count;

      // Clean up orphaned data
      const oldClusters = await this.db.suspiciousCluster.deleteMany({
        where: {
          status: 'dismissed',
          detectedAt: { lt: retentionDate },
        },
      });

      processed += oldClusters.count;

      // Clean up old false positive rings
      const oldRings = await this.db.collusionRingDetection.deleteMany({
        where: {
          status: 'false_positive',
          detectedAt: { lt: retentionDate },
        },
      });

      processed += oldRings.count;

      this.lastRunTimes.set('cleanup', new Date());

      return {
        job: 'cleanup',
        success: true,
        duration: Date.now() - startTime,
        processed,
        errors,
        details: {
          eventsDeleted: deletedEvents.count,
          clustersDeleted: oldClusters.count,
          ringsDeleted: oldRings.count,
        },
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        job: 'cleanup',
        success: false,
        duration: Date.now() - startTime,
        processed,
        errors,
      };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private scheduleJob(name: string, interval: number, job: () => Promise<JobResult>): void {
    const timer = setInterval(async () => {
      try {
        const result = await job();
        console.log(`Job ${name} completed:`, {
          success: result.success,
          duration: `${result.duration}ms`,
          processed: result.processed,
          errors: result.errors.length,
        });
      } catch (error) {
        console.error(`Job ${name} failed:`, error);
      }
    }, interval);

    this.timers.set(name, timer);
    console.log(`Scheduled job: ${name} (interval: ${interval}ms)`);
  }

  private async runInitialAnalysis(): Promise<void> {
    console.log('Running initial analysis...');

    // Run score updates first
    await this.runScoreUpdates();

    // Then quality analysis
    await this.runQualityAnalysis();

    console.log('Initial analysis complete');
  }

  private flattenScore(score: any): Record<string, any> {
    return {
      overallScore: score.overallScore,
      confidence: score.confidence,
      riskLevel: score.riskLevel,
      typingBehaviorScore: score.componentScores.typingBehavior,
      mouseBehaviorScore: score.componentScores.mouseBehavior,
      sessionPatternsScore: score.componentScores.sessionPatterns,
      conversationQualityScore: score.componentScores.conversationQuality,
      timingPatternsScore: score.componentScores.timingPatterns,
      networkAnalysisScore: score.componentScores.networkAnalysis,
      deviceFingerprintScore: score.componentScores.deviceFingerprint,
      velocityChecksScore: score.componentScores.velocityChecks,
      topRiskFactors: score.topRiskFactors,
      mitigatingFactors: score.mitigatingFactors,
      scoreHistory: score.scoreHistory,
      trend: score.trend,
      recommendedAction: score.recommendedAction,
      actionsTaken: score.actionsTaken,
      lastCalculated: score.lastCalculated,
      dataPoints: score.dataPoints,
      modelVersion: score.modelVersion,
    };
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createBatchAnalyzer(
  db: DatabaseClient,
  config?: Partial<BatchJobConfig>
): BatchAnalyzer {
  return new BatchAnalyzer(db, config);
}
