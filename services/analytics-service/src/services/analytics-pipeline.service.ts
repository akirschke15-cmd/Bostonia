/**
 * Analytics Pipeline Service
 *
 * Manages data flow from client-side collectors through processing
 * to storage and fraud scoring. Handles both real-time and batch processing.
 */

import type {
  BehavioralEvent,
  MessageComposition,
  SessionProfile,
  TypingProfile,
  BehavioralFingerprint,
} from '../models/schemas.js';
import { typingAnalyzer } from '../detectors/typing-analyzer.js';
import { fraudScoringService } from './fraud-scoring.service.js';

// =============================================================================
// TYPES
// =============================================================================

interface EventBatch {
  userId: string;
  sessionId: string;
  events: BehavioralEvent[];
  timestamp: number;
}

interface ProcessingResult {
  success: boolean;
  processed: number;
  errors: string[];
  updates: {
    typingProfile?: boolean;
    sessionProfile?: boolean;
    fraudScore?: boolean;
  };
}

interface PipelineConfig {
  // Real-time processing
  enableRealTimeScoring: boolean;
  scoringThreshold: number; // Min events before scoring

  // Batch processing
  batchSize: number;
  batchIntervalMs: number;

  // Storage
  eventRetentionDays: number;
  profileUpdateIntervalMs: number;

  // Privacy
  anonymizeAfterDays: number;
  excludedEventTypes: string[];
}

// Mock database interface (replace with Prisma in production)
interface DatabaseClient {
  behavioralEvent: {
    createMany: (data: { data: BehavioralEvent[] }) => Promise<{ count: number }>;
    findMany: (query: any) => Promise<BehavioralEvent[]>;
    deleteMany: (query: any) => Promise<{ count: number }>;
  };
  userTypingProfile: {
    upsert: (data: any) => Promise<TypingProfile>;
    findUnique: (query: any) => Promise<TypingProfile | null>;
  };
  sessionProfile: {
    create: (data: { data: SessionProfile }) => Promise<SessionProfile>;
    findMany: (query: any) => Promise<SessionProfile[]>;
  };
  userBehavioralFingerprint: {
    upsert: (data: any) => Promise<BehavioralFingerprint>;
    findUnique: (query: any) => Promise<BehavioralFingerprint | null>;
  };
  userFraudScore: {
    upsert: (data: any) => Promise<any>;
    findUnique: (query: any) => Promise<any>;
  };
}

// =============================================================================
// ANALYTICS PIPELINE SERVICE CLASS
// =============================================================================

export class AnalyticsPipelineService {
  private config: PipelineConfig;
  private db: DatabaseClient;
  private eventBuffer: Map<string, BehavioralEvent[]> = new Map();
  private processingQueue: EventBatch[] = [];
  private isProcessing: boolean = false;
  private batchTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseClient, config: Partial<PipelineConfig> = {}) {
    this.db = db;
    this.config = {
      enableRealTimeScoring: true,
      scoringThreshold: 50,
      batchSize: 100,
      batchIntervalMs: 30000, // 30 seconds
      eventRetentionDays: 90,
      profileUpdateIntervalMs: 300000, // 5 minutes
      anonymizeAfterDays: 30,
      excludedEventTypes: [],
      ...config,
    };
  }

  /**
   * Start the pipeline processing
   */
  public start(): void {
    // Start batch processing timer
    this.batchTimer = setInterval(() => {
      this.processBatches();
    }, this.config.batchIntervalMs);

    console.log('Analytics pipeline started');
  }

  /**
   * Stop the pipeline
   */
  public stop(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Flush remaining events
    this.flushAll();
    console.log('Analytics pipeline stopped');
  }

  /**
   * Ingest events from client
   */
  public async ingestEvents(batch: EventBatch): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: true,
      processed: 0,
      errors: [],
      updates: {},
    };

    try {
      // Filter excluded event types
      const filteredEvents = batch.events.filter(
        (e) => !this.config.excludedEventTypes.includes(e.eventType)
      );

      // Add to buffer
      const bufferKey = `${batch.userId}_${batch.sessionId}`;
      const existing = this.eventBuffer.get(bufferKey) || [];
      this.eventBuffer.set(bufferKey, [...existing, ...filteredEvents]);

      result.processed = filteredEvents.length;

      // Check if we should process immediately
      const bufferedCount = this.eventBuffer.get(bufferKey)?.length || 0;
      if (bufferedCount >= this.config.batchSize) {
        await this.processUserBuffer(batch.userId, batch.sessionId);
      }

      // Real-time scoring for high-risk events
      if (this.config.enableRealTimeScoring) {
        const highRiskEvents = filteredEvents.filter(
          (e) => e.eventType === 'message_submit' || e.eventType === 'keystroke_batch'
        );

        if (highRiskEvents.length > 0) {
          await this.processRealTimeScoring(batch.userId, highRiskEvents);
          result.updates.fraudScore = true;
        }
      }

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Process a message composition event
   */
  public async processComposition(
    userId: string,
    composition: MessageComposition
  ): Promise<void> {
    // Analyze composition
    const analysis = typingAnalyzer.analyzeComposition(composition);

    // Update typing profile
    const existingProfile = await this.db.userTypingProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      await this.updateTypingProfile(userId, analysis.profile, existingProfile);
    } else {
      await this.createTypingProfile(userId, analysis.profile);
    }

    // If suspicious, trigger immediate scoring
    if (analysis.score > 50) {
      await this.triggerFraudScoring(userId);
    }
  }

  /**
   * End a session and create session profile
   */
  public async endSession(
    userId: string,
    sessionId: string,
    sessionData: Partial<SessionProfile>
  ): Promise<SessionProfile> {
    // Process any remaining buffered events
    await this.processUserBuffer(userId, sessionId);

    // Get events for this session
    const events = await this.db.behavioralEvent.findMany({
      where: {
        userId,
        sessionId,
      },
      orderBy: { timestamp: 'asc' },
    });

    // Calculate session metrics
    const sessionProfile = this.calculateSessionProfile(userId, sessionId, events, sessionData);

    // Store session profile
    const stored = await this.db.sessionProfile.create({
      data: sessionProfile,
    });

    // Update behavioral fingerprint
    await this.updateBehavioralFingerprint(userId);

    // Trigger fraud scoring
    await this.triggerFraudScoring(userId);

    return stored;
  }

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================

  private async processBatches(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process all buffered events
      for (const [key, events] of this.eventBuffer) {
        const [userId, sessionId] = key.split('_');
        await this.processUserBuffer(userId, sessionId);
      }

      // Run maintenance tasks
      await this.runMaintenance();

    } finally {
      this.isProcessing = false;
    }
  }

  private async processUserBuffer(userId: string, sessionId: string): Promise<void> {
    const bufferKey = `${userId}_${sessionId}`;
    const events = this.eventBuffer.get(bufferKey);

    if (!events || events.length === 0) return;

    try {
      // Store events in database
      await this.db.behavioralEvent.createMany({
        data: events,
      });

      // Process keystroke events for typing profile
      const keystrokeEvents = events.filter(
        (e) => e.eventType === 'keystroke_batch' || e.eventType === 'keystroke'
      );
      if (keystrokeEvents.length > 0) {
        await this.processKeystrokeEvents(userId, keystrokeEvents);
      }

      // Clear buffer
      this.eventBuffer.delete(bufferKey);

    } catch (error) {
      console.error('Error processing user buffer:', error);
    }
  }

  private async processKeystrokeEvents(
    userId: string,
    events: BehavioralEvent[]
  ): Promise<void> {
    // Extract keystrokes from events
    const keystrokes: Array<{ key: string; timestamp: number; isModifier: boolean }> = [];

    for (const event of events) {
      const payload = event.payload as any;
      if (payload.keystrokes) {
        keystrokes.push(...payload.keystrokes);
      }
    }

    if (keystrokes.length < 20) return;

    // Analyze keystrokes
    const analysis = typingAnalyzer.analyzeKeystrokes(keystrokes);

    // Update profile
    const existingProfile = await this.db.userTypingProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      await this.updateTypingProfile(userId, analysis.profile, existingProfile);
    } else {
      await this.createTypingProfile(userId, analysis.profile);
    }
  }

  // ===========================================================================
  // PROFILE MANAGEMENT
  // ===========================================================================

  private async createTypingProfile(
    userId: string,
    profile: Partial<TypingProfile>
  ): Promise<void> {
    await this.db.userTypingProfile.upsert({
      where: { userId },
      create: {
        userId,
        meanInterKeyTime: profile.meanInterKeyTime || 0,
        stdInterKeyTime: profile.stdInterKeyTime || 0,
        medianInterKeyTime: profile.medianInterKeyTime || 0,
        p95InterKeyTime: profile.p95InterKeyTime || 0,
        digraphTimings: {},
        meanWPM: profile.meanWPM || 0,
        stdWPM: 0,
        backspaceRate: profile.backspaceRate || 0,
        correctionRate: 0,
        meanPauseDuration: 0,
        pauseFrequency: 0,
        meanBurstLength: 0,
        burstVariance: 0,
        consistencyScore: profile.consistencyScore || 0,
        sampleCount: profile.sampleCount || 0,
      },
      update: {},
    });
  }

  private async updateTypingProfile(
    userId: string,
    newProfile: Partial<TypingProfile>,
    existing: TypingProfile
  ): Promise<void> {
    // Exponential moving average for profile updates
    const alpha = 0.3; // Weight for new data

    const updated = {
      meanInterKeyTime: this.ema(existing.meanInterKeyTime, newProfile.meanInterKeyTime || 0, alpha),
      stdInterKeyTime: this.ema(existing.stdInterKeyTime, newProfile.stdInterKeyTime || 0, alpha),
      medianInterKeyTime: this.ema(existing.medianInterKeyTime, newProfile.medianInterKeyTime || 0, alpha),
      p95InterKeyTime: this.ema(existing.p95InterKeyTime, newProfile.p95InterKeyTime || 0, alpha),
      meanWPM: this.ema(existing.meanWPM, newProfile.meanWPM || 0, alpha),
      backspaceRate: this.ema(existing.backspaceRate, newProfile.backspaceRate || 0, alpha),
      consistencyScore: this.ema(existing.consistencyScore, newProfile.consistencyScore || 0, alpha),
      sampleCount: existing.sampleCount + (newProfile.sampleCount || 0),
    };

    await this.db.userTypingProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...updated,
        digraphTimings: {},
        stdWPM: 0,
        correctionRate: 0,
        meanPauseDuration: 0,
        pauseFrequency: 0,
        meanBurstLength: 0,
        burstVariance: 0,
      },
      update: updated,
    });
  }

  private calculateSessionProfile(
    userId: string,
    sessionId: string,
    events: BehavioralEvent[],
    partialData: Partial<SessionProfile>
  ): SessionProfile {
    const startTime = events[0]?.timestamp || new Date();
    const endTime = events[events.length - 1]?.timestamp || new Date();

    // Count event types
    const pageViews = events.filter((e) => e.eventType === 'page_view').length;
    const messageEvents = events.filter((e) => e.eventType === 'message_submit');

    // Calculate idle periods
    const idlePeriods = this.calculateIdlePeriods(events);

    // Extract unique pages from page_view events
    const pages = new Set<string>();
    events
      .filter((e) => e.eventType === 'page_view')
      .forEach((e) => {
        const payload = e.payload as any;
        if (payload.url) pages.add(payload.url);
      });

    return {
      id: `sess_${sessionId}`,
      userId,
      startTime,
      endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      pageViews,
      uniquePages: pages.size,
      meanTimeOnPage: partialData.meanTimeOnPage || 0,
      stdTimeOnPage: partialData.stdTimeOnPage || 0,
      messagessSent: messageEvents.length,
      conversationsStarted: partialData.conversationsStarted || 0,
      charactersViewed: partialData.charactersViewed || 0,
      estimatedReadingTime: partialData.estimatedReadingTime || 0,
      actualTimeBeforeResponse: partialData.actualTimeBeforeResponse || 0,
      readingSpeedRatio: partialData.readingSpeedRatio || 1,
      idlePeriods: idlePeriods.count,
      totalIdleTime: idlePeriods.totalTime,
      meanIdleDuration: idlePeriods.meanDuration,
      hourOfDay: startTime.getHours(),
      dayOfWeek: startTime.getDay(),
      isWeekend: startTime.getDay() === 0 || startTime.getDay() === 6,
      deviceFingerprint: (events[0]?.metadata as any)?.deviceFingerprint || '',
      ipHash: this.hashIP((events[0]?.metadata as any)?.ipAddress || ''),
      suspiciousFlags: partialData.suspiciousFlags || [],
      fraudScore: partialData.fraudScore || 0,
      timestamp: new Date(),
    };
  }

  private async updateBehavioralFingerprint(userId: string): Promise<void> {
    // Get recent sessions
    const sessions = await this.db.sessionProfile.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 30,
    });

    if (sessions.length < 5) return;

    // Calculate hourly activity distribution
    const hourlyActivity = new Array(24).fill(0);
    const weekdayActivity = new Array(7).fill(0);

    for (const session of sessions) {
      hourlyActivity[session.hourOfDay]++;
      weekdayActivity[session.dayOfWeek]++;
    }

    // Normalize distributions
    const totalHours = hourlyActivity.reduce((a, b) => a + b, 0);
    const totalDays = weekdayActivity.reduce((a, b) => a + b, 0);

    const normalizedHourly = hourlyActivity.map((h) => h / (totalHours || 1));
    const normalizedWeekday = weekdayActivity.map((d) => d / (totalDays || 1));

    // Calculate session duration distribution
    const durations = sessions.map((s) => s.durationMs);
    const durationStats = this.calculateDistributionStats(durations);

    // Calculate behavioral consistency
    const consistency = this.calculateBehavioralConsistency(sessions);

    // Create fingerprint hash
    const fingerprintHash = this.generateFingerprintHash(
      normalizedHourly,
      normalizedWeekday,
      consistency
    );

    await this.db.userBehavioralFingerprint.upsert({
      where: { userId },
      create: {
        userId,
        messageTimingDistribution: durationStats,
        sessionDurationDistribution: durationStats,
        activeTimeDistribution: durationStats,
        vocabularySize: 0,
        vocabularyEntropy: 0,
        hapaxLegomena: 0,
        averageWordLength: 0,
        functionWordFrequency: {},
        punctuationPatterns: {},
        sentenceComplexity: 0,
        typoFrequency: 0,
        commonMisspellings: [],
        autocorrectPatterns: 0,
        hourlyActivityDistribution: normalizedHourly,
        weekdayDistribution: normalizedWeekday,
        behavioralConsistency: consistency,
        evolutionRate: 0,
        fingerprintHash,
        confidence: Math.min(1, sessions.length / 30),
        sampleCount: sessions.length,
      },
      update: {
        hourlyActivityDistribution: normalizedHourly,
        weekdayDistribution: normalizedWeekday,
        behavioralConsistency: consistency,
        fingerprintHash,
        confidence: Math.min(1, sessions.length / 30),
        sampleCount: sessions.length,
      },
    });
  }

  // ===========================================================================
  // FRAUD SCORING
  // ===========================================================================

  private async processRealTimeScoring(
    userId: string,
    events: BehavioralEvent[]
  ): Promise<void> {
    // Get existing score
    const existingScore = await this.db.userFraudScore.findUnique({
      where: { userId },
    });

    // Quick analysis of new events
    let suspicionLevel = 0;

    for (const event of events) {
      if (event.eventType === 'keystroke_batch') {
        const payload = event.payload as any;
        if (payload.timings?.std < 20) {
          suspicionLevel += 10; // Too consistent typing
        }
      }
      if (event.eventType === 'message_submit') {
        const payload = event.payload as any;
        if (payload.effectiveWPM > 150) {
          suspicionLevel += 15; // Impossibly fast
        }
        if (payload.editRatio < 0.02) {
          suspicionLevel += 5; // No mistakes
        }
      }
    }

    // Update score if suspicion increased significantly
    if (suspicionLevel > 20 || !existingScore) {
      await this.triggerFraudScoring(userId);
    }
  }

  private async triggerFraudScoring(userId: string): Promise<void> {
    try {
      // Gather all data for scoring
      const [typingProfile, sessions, fingerprint] = await Promise.all([
        this.db.userTypingProfile.findUnique({ where: { userId } }),
        this.db.sessionProfile.findMany({
          where: { userId },
          orderBy: { timestamp: 'desc' },
          take: 30,
        }),
        this.db.userBehavioralFingerprint.findUnique({ where: { userId } }),
      ]);

      // Calculate score
      const score = await fraudScoringService.calculateScore({
        userId,
        typingProfile: typingProfile || undefined,
        sessionProfiles: sessions,
        fingerprint: fingerprint || undefined,
      });

      // Store score
      await this.db.userFraudScore.upsert({
        where: { userId },
        create: {
          userId,
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
          dataPoints: score.dataPoints,
          modelVersion: score.modelVersion,
        },
        update: {
          overallScore: score.overallScore,
          confidence: score.confidence,
          riskLevel: score.riskLevel,
          typingBehaviorScore: score.componentScores.typingBehavior,
          sessionPatternsScore: score.componentScores.sessionPatterns,
          conversationQualityScore: score.componentScores.conversationQuality,
          timingPatternsScore: score.componentScores.timingPatterns,
          topRiskFactors: score.topRiskFactors,
          mitigatingFactors: score.mitigatingFactors,
          trend: score.trend,
          recommendedAction: score.recommendedAction,
          dataPoints: score.dataPoints,
        },
      });

      // Trigger alerts for high-risk scores
      if (score.riskLevel === 'critical' || score.riskLevel === 'high') {
        await this.triggerAlert(userId, score);
      }

    } catch (error) {
      console.error('Error in fraud scoring:', error);
    }
  }

  private async triggerAlert(userId: string, score: any): Promise<void> {
    // In production, this would:
    // 1. Send to alerting system (PagerDuty, Slack, etc.)
    // 2. Create moderation queue item
    // 3. Apply automatic restrictions based on action

    console.log(`ALERT: High risk user ${userId}`, {
      score: score.overallScore,
      riskLevel: score.riskLevel,
      recommendedAction: score.recommendedAction,
      topFactors: score.topRiskFactors.slice(0, 3),
    });
  }

  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================

  private async runMaintenance(): Promise<void> {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - this.config.eventRetentionDays);

    // Delete old events
    const deleted = await this.db.behavioralEvent.deleteMany({
      where: {
        timestamp: { lt: retentionDate },
      },
    });

    if (deleted.count > 0) {
      console.log(`Deleted ${deleted.count} old behavioral events`);
    }
  }

  private flushAll(): void {
    // Synchronously process all remaining buffers
    for (const [key] of this.eventBuffer) {
      const [userId, sessionId] = key.split('_');
      this.processUserBuffer(userId, sessionId).catch(console.error);
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private ema(oldValue: number, newValue: number, alpha: number): number {
    return alpha * newValue + (1 - alpha) * oldValue;
  }

  private calculateIdlePeriods(events: BehavioralEvent[]): {
    count: number;
    totalTime: number;
    meanDuration: number;
  } {
    const IDLE_THRESHOLD = 60000; // 1 minute
    let count = 0;
    let totalTime = 0;

    for (let i = 1; i < events.length; i++) {
      const gap = events[i].timestamp.getTime() - events[i - 1].timestamp.getTime();
      if (gap > IDLE_THRESHOLD) {
        count++;
        totalTime += gap;
      }
    }

    return {
      count,
      totalTime,
      meanDuration: count > 0 ? totalTime / count : 0,
    };
  }

  private calculateDistributionStats(values: number[]): any {
    if (values.length === 0) {
      return { mean: 0, std: 0, median: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return {
      mean,
      std: Math.sqrt(variance),
      median: sorted[Math.floor(sorted.length / 2)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  private calculateBehavioralConsistency(sessions: SessionProfile[]): number {
    if (sessions.length < 2) return 0.5;

    // Calculate coefficient of variation for key metrics
    const durations = sessions.map((s) => s.durationMs);
    const messagesCounts = sessions.map((s) => s.messagessSent);

    const durationCV = this.coefficientOfVariation(durations);
    const messagesCV = this.coefficientOfVariation(messagesCounts);

    // Lower CV = higher consistency (more bot-like)
    const avgCV = (durationCV + messagesCV) / 2;
    return 1 - Math.min(1, avgCV);
  }

  private coefficientOfVariation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    const std = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    return std / mean;
  }

  private generateFingerprintHash(
    hourly: number[],
    weekday: number[],
    consistency: number
  ): string {
    const data = [...hourly, ...weekday, consistency].join(',');
    // Simple hash - use crypto in production
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private hashIP(ip: string): string {
    // Simple hash for privacy - use proper hashing in production
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = (hash << 5) - hash + ip.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createAnalyticsPipeline(
  db: DatabaseClient,
  config?: Partial<PipelineConfig>
): AnalyticsPipelineService {
  return new AnalyticsPipelineService(db, config);
}
