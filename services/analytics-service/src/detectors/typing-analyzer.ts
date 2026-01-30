/**
 * Typing Behavior Analyzer
 *
 * Analyzes keystroke patterns to detect bot-like behavior.
 * Humans have characteristic typing patterns that are difficult to fake.
 */

import type { TypingProfile, MessageComposition, DistributionStats } from '../models/schemas.js';

// =============================================================================
// TYPES
// =============================================================================

interface KeystrokeData {
  key: string;
  timestamp: number;
  isModifier: boolean;
}

interface TypingAnalysisResult {
  score: number; // 0-100, higher = more suspicious
  confidence: number; // 0-1
  factors: Array<{
    name: string;
    value: number;
    threshold: number;
    suspicious: boolean;
    weight: number;
  }>;
  profile: Partial<TypingProfile>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Human typing characteristics (based on empirical studies)
const HUMAN_TYPING = {
  // Inter-key interval (milliseconds)
  MEAN_IKI_MIN: 100,
  MEAN_IKI_MAX: 300,
  STD_IKI_MIN: 30, // Too consistent = bot
  STD_IKI_MAX: 150,
  CV_MIN: 0.2, // Coefficient of variation (std/mean)

  // Words per minute
  WPM_MIN: 20,
  WPM_MAX: 120,
  WPM_STD_MIN: 5, // Some variation expected

  // Backspace/correction patterns
  BACKSPACE_RATE_MIN: 2, // Per 100 chars
  BACKSPACE_RATE_MAX: 25,

  // Pause patterns (pauses > 500ms)
  PAUSE_FREQUENCY_MIN: 0.5, // Per message
  PAUSE_FREQUENCY_MAX: 10,
  MEAN_PAUSE_MIN: 500,
  MEAN_PAUSE_MAX: 5000,

  // Burst patterns (continuous typing)
  BURST_LENGTH_MIN: 3,
  BURST_LENGTH_MAX: 50,
};

// Common digraphs (letter pairs) with expected timing ranges
const COMMON_DIGRAPHS = [
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
];

// =============================================================================
// TYPING ANALYZER CLASS
// =============================================================================

export class TypingAnalyzer {
  /**
   * Analyze a batch of keystrokes and return suspicion score
   */
  public analyzeKeystrokes(keystrokes: KeystrokeData[]): TypingAnalysisResult {
    if (keystrokes.length < 10) {
      return {
        score: 0,
        confidence: 0,
        factors: [],
        profile: {},
      };
    }

    const factors: TypingAnalysisResult['factors'] = [];
    let totalWeight = 0;
    let weightedScore = 0;

    // Calculate inter-key intervals
    const ikis = this.calculateInterKeyIntervals(keystrokes);
    const ikiStats = this.calculateDistributionStats(ikis);

    // Factor 1: Mean IKI (too fast or too slow)
    const meanIkiFactor = this.analyzeMeanIki(ikiStats.mean);
    factors.push(meanIkiFactor);
    weightedScore += meanIkiFactor.value * meanIkiFactor.weight;
    totalWeight += meanIkiFactor.weight;

    // Factor 2: IKI consistency (bots are too consistent)
    const consistencyFactor = this.analyzeConsistency(ikiStats);
    factors.push(consistencyFactor);
    weightedScore += consistencyFactor.value * consistencyFactor.weight;
    totalWeight += consistencyFactor.weight;

    // Factor 3: Coefficient of Variation
    const cvFactor = this.analyzeCoefficientOfVariation(ikiStats);
    factors.push(cvFactor);
    weightedScore += cvFactor.value * cvFactor.weight;
    totalWeight += cvFactor.weight;

    // Factor 4: Distribution shape (humans have slight right skew)
    const shapeFactor = this.analyzeDistributionShape(ikiStats);
    factors.push(shapeFactor);
    weightedScore += shapeFactor.value * shapeFactor.weight;
    totalWeight += shapeFactor.weight;

    // Factor 5: Backspace rate
    const backspaceCount = keystrokes.filter(
      (k) => k.key === 'Backspace' || k.key === 'Delete'
    ).length;
    const backspaceRate = (backspaceCount / keystrokes.length) * 100;
    const backspaceFactor = this.analyzeBackspaceRate(backspaceRate);
    factors.push(backspaceFactor);
    weightedScore += backspaceFactor.value * backspaceFactor.weight;
    totalWeight += backspaceFactor.weight;

    // Factor 6: Pause patterns
    const pauseFactor = this.analyzePauses(ikis);
    factors.push(pauseFactor);
    weightedScore += pauseFactor.value * pauseFactor.weight;
    totalWeight += pauseFactor.weight;

    // Factor 7: Burst patterns
    const burstFactor = this.analyzeBursts(ikis);
    factors.push(burstFactor);
    weightedScore += burstFactor.value * burstFactor.weight;
    totalWeight += burstFactor.weight;

    // Calculate final score
    const score = totalWeight > 0 ? (weightedScore / totalWeight) : 0;

    // Calculate confidence based on sample size
    const confidence = Math.min(1, keystrokes.length / 100);

    // Build profile
    const profile: Partial<TypingProfile> = {
      meanInterKeyTime: ikiStats.mean,
      stdInterKeyTime: ikiStats.std,
      medianInterKeyTime: ikiStats.median,
      p95InterKeyTime: ikiStats.p95,
      backspaceRate,
      consistencyScore: 1 - (ikiStats.coefficientOfVariation / 0.5), // Normalize
      sampleCount: keystrokes.length,
    };

    return { score, confidence, factors, profile };
  }

  /**
   * Compare current typing to user's historical profile
   */
  public compareToProfile(
    current: TypingAnalysisResult,
    historical: TypingProfile
  ): { similarity: number; anomalies: string[] } {
    const anomalies: string[] = [];
    let similarityScore = 0;
    let factors = 0;

    // Compare mean IKI
    const ikiDiff = Math.abs(
      (current.profile.meanInterKeyTime || 0) - historical.meanInterKeyTime
    );
    const ikiThreshold = historical.stdInterKeyTime * 2;
    if (ikiDiff > ikiThreshold) {
      anomalies.push(`Mean IKI deviation: ${ikiDiff.toFixed(0)}ms (threshold: ${ikiThreshold.toFixed(0)}ms)`);
    } else {
      similarityScore += 1 - ikiDiff / ikiThreshold;
    }
    factors++;

    // Compare consistency
    const consistencyDiff = Math.abs(
      (current.profile.consistencyScore || 0) - historical.consistencyScore
    );
    if (consistencyDiff > 0.3) {
      anomalies.push(`Consistency change: ${(consistencyDiff * 100).toFixed(0)}%`);
    } else {
      similarityScore += 1 - consistencyDiff / 0.3;
    }
    factors++;

    // Compare backspace rate
    const bsDiff = Math.abs(
      (current.profile.backspaceRate || 0) - historical.backspaceRate
    );
    const bsThreshold = Math.max(5, historical.backspaceRate * 0.5);
    if (bsDiff > bsThreshold) {
      anomalies.push(`Backspace rate deviation: ${bsDiff.toFixed(1)}%`);
    } else {
      similarityScore += 1 - bsDiff / bsThreshold;
    }
    factors++;

    return {
      similarity: factors > 0 ? similarityScore / factors : 0,
      anomalies,
    };
  }

  /**
   * Analyze a message composition session
   */
  public analyzeComposition(composition: MessageComposition): TypingAnalysisResult {
    const factors: TypingAnalysisResult['factors'] = [];
    let totalWeight = 0;
    let weightedScore = 0;

    // Factor 1: Effective WPM
    const wpmFactor = this.analyzeWPM(composition.effectiveWPM);
    factors.push(wpmFactor);
    weightedScore += wpmFactor.value * wpmFactor.weight;
    totalWeight += wpmFactor.weight;

    // Factor 2: Edit ratio (humans edit more)
    const editFactor = this.analyzeEditRatio(composition.editRatio);
    factors.push(editFactor);
    weightedScore += editFactor.value * editFactor.weight;
    totalWeight += editFactor.weight;

    // Factor 3: Paste usage (high paste = possible bot)
    const pasteFactor = this.analyzePasteUsage(
      composition.pasteCount,
      composition.finalLength
    );
    factors.push(pasteFactor);
    weightedScore += pasteFactor.value * pasteFactor.weight;
    totalWeight += pasteFactor.weight;

    // Factor 4: Focus loss (humans get distracted)
    const focusFactor = this.analyzeFocusPatterns(
      composition.focusLostCount,
      composition.totalDurationMs
    );
    factors.push(focusFactor);
    weightedScore += focusFactor.value * focusFactor.weight;
    totalWeight += focusFactor.weight;

    // Factor 5: Active time ratio
    const activeRatio = composition.activeDurationMs / composition.totalDurationMs;
    const activeFactor = this.analyzeActiveRatio(activeRatio);
    factors.push(activeFactor);
    weightedScore += activeFactor.value * activeFactor.weight;
    totalWeight += activeFactor.weight;

    const score = totalWeight > 0 ? (weightedScore / totalWeight) : 0;
    const confidence = composition.keystrokeCount > 50 ? 1 : composition.keystrokeCount / 50;

    return {
      score,
      confidence,
      factors,
      profile: {
        meanWPM: composition.effectiveWPM,
        backspaceRate: (composition.backspaceCount / composition.keystrokeCount) * 100,
      },
    };
  }

  // ===========================================================================
  // PRIVATE ANALYSIS METHODS
  // ===========================================================================

  private calculateInterKeyIntervals(keystrokes: KeystrokeData[]): number[] {
    const intervals: number[] = [];
    for (let i = 1; i < keystrokes.length; i++) {
      // Skip intervals involving modifier keys
      if (!keystrokes[i].isModifier && !keystrokes[i - 1].isModifier) {
        intervals.push(keystrokes[i].timestamp - keystrokes[i - 1].timestamp);
      }
    }
    return intervals;
  }

  private calculateDistributionStats(values: number[]): DistributionStats {
    if (values.length === 0) {
      return {
        mean: 0, std: 0, median: 0, min: 0, max: 0,
        skewness: 0, kurtosis: 0,
        p5: 0, p25: 0, p75: 0, p95: 0,
        coefficientOfVariation: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;

    // Basic stats
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const median = sorted[Math.floor(n / 2)];

    // Percentiles
    const percentile = (p: number) => sorted[Math.floor(n * p)];

    // Skewness and kurtosis
    const m3 = values.reduce((sum, v) => sum + Math.pow(v - mean, 3), 0) / n;
    const m4 = values.reduce((sum, v) => sum + Math.pow(v - mean, 4), 0) / n;
    const skewness = std > 0 ? m3 / Math.pow(std, 3) : 0;
    const kurtosis = std > 0 ? m4 / Math.pow(std, 4) - 3 : 0;

    return {
      mean,
      std,
      median,
      min: sorted[0],
      max: sorted[n - 1],
      skewness,
      kurtosis,
      p5: percentile(0.05),
      p25: percentile(0.25),
      p75: percentile(0.75),
      p95: percentile(0.95),
      coefficientOfVariation: mean > 0 ? std / mean : 0,
    };
  }

  private analyzeMeanIki(mean: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    if (mean < HUMAN_TYPING.MEAN_IKI_MIN) {
      // Too fast - likely bot
      value = Math.min(100, ((HUMAN_TYPING.MEAN_IKI_MIN - mean) / HUMAN_TYPING.MEAN_IKI_MIN) * 100);
      suspicious = true;
    } else if (mean > HUMAN_TYPING.MEAN_IKI_MAX * 2) {
      // Very slow - might be deliberate slowdown
      value = 30;
      suspicious = true;
    }

    return {
      name: 'mean_iki',
      value,
      threshold: HUMAN_TYPING.MEAN_IKI_MIN,
      suspicious,
      weight: 2,
    };
  }

  private analyzeConsistency(stats: DistributionStats): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // Too little variation is bot-like
    if (stats.std < HUMAN_TYPING.STD_IKI_MIN) {
      value = Math.min(100, ((HUMAN_TYPING.STD_IKI_MIN - stats.std) / HUMAN_TYPING.STD_IKI_MIN) * 100);
      suspicious = true;
    }

    return {
      name: 'iki_consistency',
      value,
      threshold: HUMAN_TYPING.STD_IKI_MIN,
      suspicious,
      weight: 3, // High weight - this is very indicative
    };
  }

  private analyzeCoefficientOfVariation(stats: DistributionStats): TypingAnalysisResult['factors'][0] {
    const cv = stats.coefficientOfVariation;
    let value = 0;
    let suspicious = false;

    // CV < 0.2 is suspiciously consistent
    if (cv < HUMAN_TYPING.CV_MIN) {
      value = Math.min(100, ((HUMAN_TYPING.CV_MIN - cv) / HUMAN_TYPING.CV_MIN) * 100);
      suspicious = true;
    }

    return {
      name: 'coefficient_of_variation',
      value,
      threshold: HUMAN_TYPING.CV_MIN,
      suspicious,
      weight: 2.5,
    };
  }

  private analyzeDistributionShape(stats: DistributionStats): TypingAnalysisResult['factors'][0] {
    // Human typing typically has slight positive skewness (right tail)
    // and positive kurtosis (more peaked than normal)
    let value = 0;
    let suspicious = false;

    // Perfect normal distribution (skew=0, kurt=0) or negative skew is suspicious
    if (Math.abs(stats.skewness) < 0.1 && Math.abs(stats.kurtosis) < 0.5) {
      value = 50; // Too perfect
      suspicious = true;
    } else if (stats.skewness < -0.5) {
      value = 70; // Wrong direction
      suspicious = true;
    }

    return {
      name: 'distribution_shape',
      value,
      threshold: 0.1,
      suspicious,
      weight: 1.5,
    };
  }

  private analyzeBackspaceRate(rate: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // Zero or very low backspace rate is suspicious (bots don't make mistakes)
    if (rate < HUMAN_TYPING.BACKSPACE_RATE_MIN) {
      value = Math.min(100, ((HUMAN_TYPING.BACKSPACE_RATE_MIN - rate) / HUMAN_TYPING.BACKSPACE_RATE_MIN) * 100);
      suspicious = true;
    }

    return {
      name: 'backspace_rate',
      value,
      threshold: HUMAN_TYPING.BACKSPACE_RATE_MIN,
      suspicious,
      weight: 2,
    };
  }

  private analyzePauses(ikis: number[]): TypingAnalysisResult['factors'][0] {
    const PAUSE_THRESHOLD = 500; // ms
    const pauses = ikis.filter((iki) => iki > PAUSE_THRESHOLD);
    const pauseFrequency = pauses.length;

    let value = 0;
    let suspicious = false;

    // No pauses is suspicious - humans think/hesitate
    if (pauseFrequency < HUMAN_TYPING.PAUSE_FREQUENCY_MIN && ikis.length > 20) {
      value = 60;
      suspicious = true;
    }

    return {
      name: 'pause_patterns',
      value,
      threshold: HUMAN_TYPING.PAUSE_FREQUENCY_MIN,
      suspicious,
      weight: 1.5,
    };
  }

  private analyzeBursts(ikis: number[]): TypingAnalysisResult['factors'][0] {
    const BURST_THRESHOLD = 150; // ms - keystrokes faster than this are in a burst
    const bursts: number[] = [];
    let currentBurst = 1;

    for (const iki of ikis) {
      if (iki < BURST_THRESHOLD) {
        currentBurst++;
      } else {
        if (currentBurst > 1) {
          bursts.push(currentBurst);
        }
        currentBurst = 1;
      }
    }
    if (currentBurst > 1) {
      bursts.push(currentBurst);
    }

    let value = 0;
    let suspicious = false;

    if (bursts.length > 0) {
      const meanBurst = bursts.reduce((a, b) => a + b, 0) / bursts.length;
      const burstVariance = bursts.reduce((sum, b) => sum + Math.pow(b - meanBurst, 2), 0) / bursts.length;

      // Very consistent burst lengths are suspicious
      if (burstVariance < 2 && bursts.length > 3) {
        value = 50;
        suspicious = true;
      }

      // Unnaturally long bursts
      if (meanBurst > HUMAN_TYPING.BURST_LENGTH_MAX) {
        value = Math.max(value, 60);
        suspicious = true;
      }
    }

    return {
      name: 'burst_patterns',
      value,
      threshold: HUMAN_TYPING.BURST_LENGTH_MAX,
      suspicious,
      weight: 1,
    };
  }

  private analyzeWPM(wpm: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    if (wpm > HUMAN_TYPING.WPM_MAX) {
      // Faster than humanly possible
      value = Math.min(100, ((wpm - HUMAN_TYPING.WPM_MAX) / HUMAN_TYPING.WPM_MAX) * 100);
      suspicious = true;
    } else if (wpm < HUMAN_TYPING.WPM_MIN && wpm > 0) {
      // Unusually slow might be deliberate throttling
      value = 20;
    }

    return {
      name: 'typing_speed',
      value,
      threshold: HUMAN_TYPING.WPM_MAX,
      suspicious,
      weight: 2,
    };
  }

  private analyzeEditRatio(ratio: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // Very low edit ratio means no mistakes - suspicious
    if (ratio < 0.05) {
      value = 50;
      suspicious = true;
    }

    return {
      name: 'edit_ratio',
      value,
      threshold: 0.05,
      suspicious,
      weight: 1.5,
    };
  }

  private analyzePasteUsage(pasteCount: number, messageLength: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // Mostly pasted content is suspicious
    if (pasteCount > 0 && messageLength > 50) {
      // This is just a flag - would need actual paste content length to be accurate
      if (pasteCount > 3) {
        value = 40;
        suspicious = true;
      }
    }

    return {
      name: 'paste_usage',
      value,
      threshold: 3,
      suspicious,
      weight: 1,
    };
  }

  private analyzeFocusPatterns(
    focusLostCount: number,
    totalDuration: number
  ): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // For long composition times, some focus loss is expected
    const durationMinutes = totalDuration / 60000;

    if (durationMinutes > 1 && focusLostCount === 0) {
      // Never looked away during a long composition
      value = 30;
      suspicious = true;
    }

    return {
      name: 'focus_patterns',
      value,
      threshold: 1,
      suspicious,
      weight: 0.5,
    };
  }

  private analyzeActiveRatio(ratio: number): TypingAnalysisResult['factors'][0] {
    let value = 0;
    let suspicious = false;

    // Active ratio > 0.95 is suspicious (no thinking time)
    if (ratio > 0.95) {
      value = 40;
      suspicious = true;
    }

    return {
      name: 'active_ratio',
      value,
      threshold: 0.95,
      suspicious,
      weight: 1,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const typingAnalyzer = new TypingAnalyzer();
