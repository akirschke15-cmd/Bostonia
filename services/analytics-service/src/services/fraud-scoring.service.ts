/**
 * Fraud Scoring Service
 *
 * Combines all behavioral signals into a unified fraud score.
 * Implements scoring algorithms, threshold calibration, and decision logic.
 */

import type {
  FraudScore,
  RiskFactor,
  TypingProfile,
  SessionProfile,
  ConversationQuality,
  BehavioralFingerprint,
  UserCluster,
} from '../models/schemas.js';
import { typingAnalyzer } from '../detectors/typing-analyzer.js';
import { conversationQualityAnalyzer } from '../detectors/conversation-quality-analyzer.js';
import { networkAnalyzer } from '../detectors/network-analyzer.js';

// =============================================================================
// TYPES
// =============================================================================

interface ScoringWeights {
  typing: number;
  mouse: number;
  session: number;
  conversation: number;
  timing: number;
  network: number;
  device: number;
  velocity: number;
}

interface ScoringInput {
  userId: string;
  typingProfile?: TypingProfile;
  sessionProfiles?: SessionProfile[];
  conversationQualities?: ConversationQuality[];
  fingerprint?: BehavioralFingerprint;
  clusters?: UserCluster[];
  recentActivity?: Array<{ timestamp: Date; type: string; amount?: number }>;
  deviceInfo?: {
    fingerprint: string;
    knownFingerprints: string[];
    ipHash: string;
    knownIpHashes: string[];
  };
}

interface ThresholdConfig {
  low: { min: number; max: number };
  medium: { min: number; max: number };
  high: { min: number; max: number };
  critical: { min: number; max: number };
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Default scoring weights (sum to 1.0)
const DEFAULT_WEIGHTS: ScoringWeights = {
  typing: 0.20,      // 20% - Typing patterns
  mouse: 0.10,       // 10% - Mouse/touch patterns
  session: 0.15,     // 15% - Session behavior
  conversation: 0.20, // 20% - Conversation quality
  timing: 0.10,      // 10% - Timing patterns
  network: 0.15,     // 15% - Network/cluster analysis
  device: 0.05,      // 5%  - Device fingerprinting
  velocity: 0.05,    // 5%  - Velocity checks
};

// Risk level thresholds
const RISK_THRESHOLDS: ThresholdConfig = {
  low: { min: 0, max: 25 },
  medium: { min: 25, max: 50 },
  high: { min: 50, max: 75 },
  critical: { min: 75, max: 100 },
};

// Recommended actions per risk level
const ACTION_THRESHOLDS = {
  none: 20,
  monitor: 35,
  challenge: 55,   // CAPTCHA or additional verification
  restrict: 75,    // Rate limit, reduce features
  ban: 90,         // Automatic ban pending review
};

// =============================================================================
// FRAUD SCORING SERVICE CLASS
// =============================================================================

export class FraudScoringService {
  private weights: ScoringWeights;
  private thresholds: ThresholdConfig;
  private modelVersion: string = '1.0.0';

  constructor(
    weights: Partial<ScoringWeights> = {},
    thresholds: Partial<ThresholdConfig> = {}
  ) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
    this.thresholds = { ...RISK_THRESHOLDS, ...thresholds };

    // Normalize weights to sum to 1
    this.normalizeWeights();
  }

  /**
   * Calculate comprehensive fraud score for a user
   */
  public async calculateScore(input: ScoringInput): Promise<FraudScore> {
    const componentScores = {
      typingBehavior: 0,
      mouseBehavior: 0,
      sessionPatterns: 0,
      conversationQuality: 0,
      timingPatterns: 0,
      networkAnalysis: 0,
      deviceFingerprint: 0,
      velocityChecks: 0,
    };

    const riskFactors: RiskFactor[] = [];
    const mitigatingFactors: string[] = [];
    let dataPoints = 0;

    // 1. Typing Behavior Score
    if (input.typingProfile) {
      const typingResult = this.scoreTypingBehavior(input.typingProfile);
      componentScores.typingBehavior = typingResult.score;
      riskFactors.push(...typingResult.factors);
      mitigatingFactors.push(...typingResult.mitigating);
      dataPoints += input.typingProfile.sampleCount;
    }

    // 2. Mouse Behavior Score (placeholder - would need MouseProfile)
    componentScores.mouseBehavior = 0; // Would integrate with mouse analyzer

    // 3. Session Patterns Score
    if (input.sessionProfiles && input.sessionProfiles.length > 0) {
      const sessionResult = this.scoreSessionPatterns(input.sessionProfiles);
      componentScores.sessionPatterns = sessionResult.score;
      riskFactors.push(...sessionResult.factors);
      mitigatingFactors.push(...sessionResult.mitigating);
      dataPoints += input.sessionProfiles.length;
    }

    // 4. Conversation Quality Score
    if (input.conversationQualities && input.conversationQualities.length > 0) {
      const convoResult = this.scoreConversationQuality(input.conversationQualities);
      componentScores.conversationQuality = convoResult.score;
      riskFactors.push(...convoResult.factors);
      mitigatingFactors.push(...convoResult.mitigating);
      dataPoints += input.conversationQualities.length;
    }

    // 5. Timing Patterns Score
    if (input.fingerprint) {
      const timingResult = this.scoreTimingPatterns(input.fingerprint);
      componentScores.timingPatterns = timingResult.score;
      riskFactors.push(...timingResult.factors);
      mitigatingFactors.push(...timingResult.mitigating);
    }

    // 6. Network Analysis Score
    if (input.clusters && input.clusters.length > 0) {
      const networkResult = this.scoreNetworkAnalysis(input.clusters, input.userId);
      componentScores.networkAnalysis = networkResult.score;
      riskFactors.push(...networkResult.factors);
    }

    // 7. Device Fingerprint Score
    if (input.deviceInfo) {
      const deviceResult = this.scoreDeviceFingerprint(input.deviceInfo);
      componentScores.deviceFingerprint = deviceResult.score;
      riskFactors.push(...deviceResult.factors);
      mitigatingFactors.push(...deviceResult.mitigating);
    }

    // 8. Velocity Checks Score
    if (input.recentActivity && input.recentActivity.length > 0) {
      const velocityResult = networkAnalyzer.analyzeVelocity(
        input.userId,
        input.recentActivity
      );
      componentScores.velocityChecks = velocityResult.score;
      if (velocityResult.suspicious) {
        riskFactors.push({
          factor: 'velocity_anomaly',
          score: velocityResult.score,
          weight: this.weights.velocity,
          evidence: velocityResult.flags.join('; '),
        });
      }
    }

    // Calculate weighted overall score
    const overallScore = this.calculateWeightedScore(componentScores);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(overallScore);

    // Determine recommended action
    const recommendedAction = this.determineAction(overallScore);

    // Calculate confidence based on data points
    const confidence = this.calculateConfidence(dataPoints, componentScores);

    // Sort risk factors by weighted impact
    const sortedFactors = riskFactors
      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
      .slice(0, 10); // Top 10 factors

    return {
      userId: input.userId,
      overallScore,
      confidence,
      riskLevel,
      componentScores,
      topRiskFactors: sortedFactors,
      mitigatingFactors,
      scoreHistory: [], // Would be populated from database
      trend: 'stable', // Would need historical comparison
      recommendedAction,
      actionsTaken: [],
      lastCalculated: new Date(),
      dataPoints,
      modelVersion: this.modelVersion,
    };
  }

  /**
   * Update score incrementally with new data
   */
  public updateScore(
    existingScore: FraudScore,
    newData: Partial<ScoringInput>
  ): FraudScore {
    // Blend old and new scores with decay factor
    const DECAY_FACTOR = 0.9; // Weight of historical data
    const NEW_WEIGHT = 1 - DECAY_FACTOR;

    // This is a simplified implementation - production would need more sophistication
    const updatedScore = { ...existingScore };

    // Update component scores if new data available
    if (newData.typingProfile) {
      const typingResult = this.scoreTypingBehavior(newData.typingProfile);
      updatedScore.componentScores.typingBehavior =
        existingScore.componentScores.typingBehavior * DECAY_FACTOR +
        typingResult.score * NEW_WEIGHT;
    }

    // Recalculate overall score
    updatedScore.overallScore = this.calculateWeightedScore(updatedScore.componentScores);
    updatedScore.riskLevel = this.determineRiskLevel(updatedScore.overallScore);
    updatedScore.recommendedAction = this.determineAction(updatedScore.overallScore);
    updatedScore.lastCalculated = new Date();

    // Update trend
    if (updatedScore.scoreHistory.length > 0) {
      const lastScore = updatedScore.scoreHistory[updatedScore.scoreHistory.length - 1].score;
      if (updatedScore.overallScore > lastScore + 5) {
        updatedScore.trend = 'worsening';
      } else if (updatedScore.overallScore < lastScore - 5) {
        updatedScore.trend = 'improving';
      } else {
        updatedScore.trend = 'stable';
      }
    }

    // Add to history
    updatedScore.scoreHistory.push({
      timestamp: new Date(),
      score: updatedScore.overallScore,
    });

    // Keep only last 30 days of history
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    updatedScore.scoreHistory = updatedScore.scoreHistory.filter(
      (h) => h.timestamp.getTime() > thirtyDaysAgo
    );

    return updatedScore;
  }

  /**
   * Calibrate thresholds based on labeled data
   */
  public calibrateThresholds(
    labeledData: Array<{ score: number; isBot: boolean }>
  ): { thresholds: ThresholdConfig; metrics: CalibrationMetrics } {
    // Sort by score
    const sorted = [...labeledData].sort((a, b) => a.score - b.score);

    // Find optimal thresholds using ROC analysis
    let bestThreshold = 50;
    let bestF1 = 0;

    for (let threshold = 20; threshold <= 80; threshold += 5) {
      const metrics = this.calculateMetrics(labeledData, threshold);
      const f1 = (2 * metrics.precision * metrics.recall) /
        (metrics.precision + metrics.recall || 1);

      if (f1 > bestF1) {
        bestF1 = f1;
        bestThreshold = threshold;
      }
    }

    // Generate threshold config
    const calibratedThresholds: ThresholdConfig = {
      low: { min: 0, max: bestThreshold * 0.5 },
      medium: { min: bestThreshold * 0.5, max: bestThreshold },
      high: { min: bestThreshold, max: bestThreshold * 1.5 },
      critical: { min: bestThreshold * 1.5, max: 100 },
    };

    const finalMetrics = this.calculateMetrics(labeledData, bestThreshold);

    return {
      thresholds: calibratedThresholds,
      metrics: {
        ...finalMetrics,
        optimalThreshold: bestThreshold,
        sampleSize: labeledData.length,
      },
    };
  }

  // ===========================================================================
  // PRIVATE SCORING METHODS
  // ===========================================================================

  private scoreTypingBehavior(profile: TypingProfile): {
    score: number;
    factors: RiskFactor[];
    mitigating: string[];
  } {
    const factors: RiskFactor[] = [];
    const mitigating: string[] = [];
    let score = 0;

    // Check consistency (bots are too consistent)
    if (profile.consistencyScore > 0.9) {
      factors.push({
        factor: 'typing_too_consistent',
        score: (profile.consistencyScore - 0.9) * 100 * 10,
        weight: this.weights.typing,
        evidence: `Consistency score: ${profile.consistencyScore.toFixed(2)} (expected < 0.9)`,
      });
      score += 30;
    } else if (profile.consistencyScore < 0.3) {
      mitigating.push('Natural typing variance detected');
    }

    // Check typing speed
    if (profile.meanWPM > 120) {
      factors.push({
        factor: 'typing_too_fast',
        score: Math.min(100, (profile.meanWPM - 120) * 2),
        weight: this.weights.typing,
        evidence: `Mean WPM: ${profile.meanWPM.toFixed(0)} (human max ~120)`,
      });
      score += 25;
    } else if (profile.meanWPM > 60 && profile.meanWPM < 100) {
      mitigating.push('Normal typing speed');
    }

    // Check backspace rate (humans make mistakes)
    if (profile.backspaceRate < 2) {
      factors.push({
        factor: 'no_typing_errors',
        score: (2 - profile.backspaceRate) * 25,
        weight: this.weights.typing,
        evidence: `Backspace rate: ${profile.backspaceRate.toFixed(1)}% (humans typically 2-15%)`,
      });
      score += 20;
    } else if (profile.backspaceRate > 5 && profile.backspaceRate < 20) {
      mitigating.push('Natural error correction patterns');
    }

    // Check pause patterns
    if (profile.pauseFrequency < 0.5 && profile.sampleCount > 10) {
      factors.push({
        factor: 'no_thinking_pauses',
        score: 30,
        weight: this.weights.typing,
        evidence: `Few pauses detected (humans pause to think)`,
      });
      score += 15;
    }

    return { score: Math.min(100, score), factors, mitigating };
  }

  private scoreSessionPatterns(sessions: SessionProfile[]): {
    score: number;
    factors: RiskFactor[];
    mitigating: string[];
  } {
    const factors: RiskFactor[] = [];
    const mitigating: string[] = [];
    let score = 0;

    // Aggregate session metrics
    const avgDuration = sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessions.length;
    const avgReadingRatio = sessions.reduce((sum, s) => sum + s.readingSpeedRatio, 0) / sessions.length;
    const totalSuspiciousFlags = sessions.flatMap((s) => s.suspiciousFlags);

    // Check reading speed (too fast = not actually reading)
    if (avgReadingRatio < 0.3) {
      factors.push({
        factor: 'reading_too_fast',
        score: (0.3 - avgReadingRatio) * 100,
        weight: this.weights.session,
        evidence: `Reading ratio: ${avgReadingRatio.toFixed(2)} (responding faster than possible reading time)`,
      });
      score += 30;
    }

    // Check session duration patterns
    const durations = sessions.map((s) => s.durationMs);
    const durationVariance = this.calculateVariance(durations);
    const durationCV = Math.sqrt(durationVariance) / (avgDuration || 1);

    if (durationCV < 0.1 && sessions.length > 3) {
      factors.push({
        factor: 'uniform_session_durations',
        score: 40,
        weight: this.weights.session,
        evidence: `Session durations too consistent (CV: ${durationCV.toFixed(2)})`,
      });
      score += 25;
    }

    // Check idle patterns
    const avgIdlePeriods = sessions.reduce((sum, s) => sum + s.idlePeriods, 0) / sessions.length;
    if (avgIdlePeriods === 0 && avgDuration > 300000) {
      // No idle in 5+ minute sessions
      factors.push({
        factor: 'no_idle_time',
        score: 25,
        weight: this.weights.session,
        evidence: 'No idle periods detected in long sessions',
      });
      score += 15;
    }

    // Check aggregated suspicious flags
    if (totalSuspiciousFlags.length > sessions.length * 2) {
      factors.push({
        factor: 'multiple_suspicious_flags',
        score: Math.min(40, totalSuspiciousFlags.length * 5),
        weight: this.weights.session,
        evidence: `${totalSuspiciousFlags.length} suspicious behaviors flagged`,
      });
      score += 20;
    }

    // Mitigating factors
    if (avgReadingRatio > 0.8 && avgReadingRatio < 2) {
      mitigating.push('Normal reading/response ratio');
    }
    if (avgIdlePeriods > 2) {
      mitigating.push('Natural idle patterns (user takes breaks)');
    }

    return { score: Math.min(100, score), factors, mitigating };
  }

  private scoreConversationQuality(qualities: ConversationQuality[]): {
    score: number;
    factors: RiskFactor[];
    mitigating: string[];
  } {
    const factors: RiskFactor[] = [];
    const mitigating: string[] = [];
    let score = 0;

    // Aggregate quality metrics
    const avgCoherence = qualities.reduce((sum, q) => sum + q.semanticCoherence, 0) / qualities.length;
    const avgVocab = qualities.reduce((sum, q) => sum + q.vocabularyRichness, 0) / qualities.length;
    const avgContextRetention = qualities.reduce((sum, q) => sum + q.contextRetention, 0) / qualities.length;
    const lowQualityCount = qualities.filter((q) => q.isLowQuality).length;

    // Check semantic coherence
    if (avgCoherence < 0.3) {
      factors.push({
        factor: 'low_coherence',
        score: (0.3 - avgCoherence) * 100,
        weight: this.weights.conversation,
        evidence: `Low semantic coherence: ${(avgCoherence * 100).toFixed(0)}%`,
      });
      score += 25;
    }

    // Check vocabulary richness
    if (avgVocab < 0.3) {
      factors.push({
        factor: 'limited_vocabulary',
        score: (0.3 - avgVocab) * 100,
        weight: this.weights.conversation,
        evidence: `Limited vocabulary diversity: ${(avgVocab * 100).toFixed(0)}%`,
      });
      score += 20;
    }

    // Check context retention
    if (avgContextRetention < 0.2) {
      factors.push({
        factor: 'poor_context_retention',
        score: (0.2 - avgContextRetention) * 100,
        weight: this.weights.conversation,
        evidence: 'User appears to ignore conversation history',
      });
      score += 20;
    }

    // Check low quality ratio
    const lowQualityRatio = lowQualityCount / qualities.length;
    if (lowQualityRatio > 0.5) {
      factors.push({
        factor: 'high_low_quality_ratio',
        score: lowQualityRatio * 50,
        weight: this.weights.conversation,
        evidence: `${(lowQualityRatio * 100).toFixed(0)}% of conversations are low quality`,
      });
      score += 25;
    }

    // Mitigating factors
    if (avgCoherence > 0.7) {
      mitigating.push('High quality, coherent conversations');
    }
    if (avgContextRetention > 0.5) {
      mitigating.push('Good memory/context retention in conversations');
    }

    return { score: Math.min(100, score), factors, mitigating };
  }

  private scoreTimingPatterns(fingerprint: BehavioralFingerprint): {
    score: number;
    factors: RiskFactor[];
    mitigating: string[];
  } {
    const factors: RiskFactor[] = [];
    const mitigating: string[] = [];
    let score = 0;

    // Check timing consistency (bots have mechanical timing)
    if (fingerprint.behavioralConsistency > 0.95) {
      factors.push({
        factor: 'mechanical_timing',
        score: (fingerprint.behavioralConsistency - 0.95) * 2000,
        weight: this.weights.timing,
        evidence: `Behavioral consistency: ${(fingerprint.behavioralConsistency * 100).toFixed(1)}% (suspiciously high)`,
      });
      score += 30;
    }

    // Check activity hour distribution (bots often run 24/7 uniformly)
    const hourlyEntropy = this.calculateEntropy(fingerprint.hourlyActivityDistribution);
    const maxEntropy = Math.log2(24);
    const normalizedEntropy = hourlyEntropy / maxEntropy;

    if (normalizedEntropy > 0.95) {
      factors.push({
        factor: 'uniform_activity_times',
        score: (normalizedEntropy - 0.95) * 2000,
        weight: this.weights.timing,
        evidence: 'Activity uniformly distributed across all hours (no sleep pattern)',
      });
      score += 25;
    }

    // Check weekday distribution
    const weekdayEntropy = this.calculateEntropy(fingerprint.weekdayDistribution);
    const maxWeekdayEntropy = Math.log2(7);
    const normalizedWeekdayEntropy = weekdayEntropy / maxWeekdayEntropy;

    if (normalizedWeekdayEntropy > 0.98) {
      factors.push({
        factor: 'uniform_weekday_activity',
        score: 20,
        weight: this.weights.timing,
        evidence: 'No variation between weekdays and weekends',
      });
      score += 15;
    }

    // Mitigating factors
    if (normalizedEntropy < 0.7) {
      mitigating.push('Clear daily activity pattern (human sleep schedule)');
    }
    if (fingerprint.behavioralConsistency < 0.7) {
      mitigating.push('Natural behavioral variation over time');
    }

    return { score: Math.min(100, score), factors, mitigating };
  }

  private scoreNetworkAnalysis(clusters: UserCluster[], userId: string): {
    score: number;
    factors: RiskFactor[];
  } {
    const factors: RiskFactor[] = [];
    let score = 0;

    // Find clusters containing this user
    const userClusters = clusters.filter((c) => c.userIds.includes(userId));

    for (const cluster of userClusters) {
      if (cluster.clusterRiskScore > 50) {
        factors.push({
          factor: 'suspicious_cluster_membership',
          score: cluster.clusterRiskScore,
          weight: this.weights.network,
          evidence: `Member of suspicious cluster: ${cluster.riskFactors.join(', ')}`,
        });
        score = Math.max(score, cluster.clusterRiskScore);
      }

      // Additional penalty for very suspicious clusters
      if (cluster.sharedIpHashes.length > 0) {
        score += 15;
      }
      if (cluster.sharedDeviceFingerprints.length > 0) {
        score += 10;
      }
    }

    return { score: Math.min(100, score), factors };
  }

  private scoreDeviceFingerprint(deviceInfo: {
    fingerprint: string;
    knownFingerprints: string[];
    ipHash: string;
    knownIpHashes: string[];
  }): {
    score: number;
    factors: RiskFactor[];
    mitigating: string[];
  } {
    const factors: RiskFactor[] = [];
    const mitigating: string[] = [];
    let score = 0;

    // Check for shared fingerprints (same device, different accounts)
    const sharedFingerprintCount = deviceInfo.knownFingerprints.filter(
      (f) => f === deviceInfo.fingerprint
    ).length;

    if (sharedFingerprintCount > 1) {
      factors.push({
        factor: 'shared_device_fingerprint',
        score: Math.min(50, sharedFingerprintCount * 15),
        weight: this.weights.device,
        evidence: `Device fingerprint shared with ${sharedFingerprintCount} other accounts`,
      });
      score += sharedFingerprintCount * 10;
    }

    // Check for shared IPs
    const sharedIpCount = deviceInfo.knownIpHashes.filter(
      (ip) => ip === deviceInfo.ipHash
    ).length;

    if (sharedIpCount > 3) {
      // Allow some sharing (family, office)
      factors.push({
        factor: 'shared_ip_address',
        score: Math.min(40, (sharedIpCount - 3) * 10),
        weight: this.weights.device,
        evidence: `IP address shared with ${sharedIpCount} other accounts`,
      });
      score += (sharedIpCount - 3) * 5;
    }

    // Mitigating factors
    if (sharedFingerprintCount === 0) {
      mitigating.push('Unique device fingerprint');
    }
    if (sharedIpCount <= 2) {
      mitigating.push('Normal IP sharing pattern (family/household)');
    }

    return { score: Math.min(100, score), factors, mitigating };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private normalizeWeights(): void {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (sum > 0 && Math.abs(sum - 1) > 0.001) {
      for (const key of Object.keys(this.weights) as Array<keyof ScoringWeights>) {
        this.weights[key] /= sum;
      }
    }
  }

  private calculateWeightedScore(componentScores: FraudScore['componentScores']): number {
    return (
      componentScores.typingBehavior * this.weights.typing +
      componentScores.mouseBehavior * this.weights.mouse +
      componentScores.sessionPatterns * this.weights.session +
      componentScores.conversationQuality * this.weights.conversation +
      componentScores.timingPatterns * this.weights.timing +
      componentScores.networkAnalysis * this.weights.network +
      componentScores.deviceFingerprint * this.weights.device +
      componentScores.velocityChecks * this.weights.velocity
    );
  }

  private determineRiskLevel(score: number): FraudScore['riskLevel'] {
    if (score < this.thresholds.low.max) return 'low';
    if (score < this.thresholds.medium.max) return 'medium';
    if (score < this.thresholds.high.max) return 'high';
    return 'critical';
  }

  private determineAction(score: number): FraudScore['recommendedAction'] {
    if (score < ACTION_THRESHOLDS.none) return 'none';
    if (score < ACTION_THRESHOLDS.monitor) return 'monitor';
    if (score < ACTION_THRESHOLDS.challenge) return 'challenge';
    if (score < ACTION_THRESHOLDS.restrict) return 'restrict';
    return 'ban';
  }

  private calculateConfidence(
    dataPoints: number,
    componentScores: FraudScore['componentScores']
  ): number {
    // Base confidence from data quantity
    let confidence = Math.min(0.5, dataPoints / 100);

    // Add confidence for components that have data
    const activeComponents = Object.values(componentScores).filter((s) => s > 0).length;
    confidence += (activeComponents / 8) * 0.5;

    return Math.min(1, confidence);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private calculateEntropy(distribution: number[]): number {
    const sum = distribution.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;

    let entropy = 0;
    for (const count of distribution) {
      if (count > 0) {
        const p = count / sum;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  private calculateMetrics(
    data: Array<{ score: number; isBot: boolean }>,
    threshold: number
  ): { precision: number; recall: number; accuracy: number; falsePositiveRate: number } {
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (const item of data) {
      const predicted = item.score >= threshold;
      if (item.isBot && predicted) tp++;
      else if (!item.isBot && predicted) fp++;
      else if (!item.isBot && !predicted) tn++;
      else fn++;
    }

    return {
      precision: tp / (tp + fp || 1),
      recall: tp / (tp + fn || 1),
      accuracy: (tp + tn) / data.length,
      falsePositiveRate: fp / (fp + tn || 1),
    };
  }
}

// =============================================================================
// TYPES FOR CALIBRATION
// =============================================================================

interface CalibrationMetrics {
  precision: number;
  recall: number;
  accuracy: number;
  falsePositiveRate: number;
  optimalThreshold: number;
  sampleSize: number;
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const fraudScoringService = new FraudScoringService();
