/**
 * Conversation Quality Analyzer
 *
 * Analyzes conversation patterns to detect low-quality bot interactions
 * designed to inflate creator revenue metrics.
 */

import type { ConversationQuality, DistributionStats } from '../models/schemas.js';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
  tokenCount?: number;
}

interface Character {
  id: string;
  name: string;
  systemPrompt: string;
  traits: string[];
  category: string;
}

interface ConversationAnalysisResult {
  score: number; // 0-100, higher = lower quality (more suspicious)
  confidence: number;
  metrics: Partial<ConversationQuality>;
  flags: string[];
  details: Record<string, unknown>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const QUALITY_THRESHOLDS = {
  // Semantic coherence
  MIN_COHERENCE: 0.3,

  // Topic diversity
  MIN_TOPIC_DIVERSITY: 0.2,
  MAX_TOPIC_DIVERSITY: 0.9, // Too diverse = random

  // Response timing
  MIN_RESPONSE_TIME_MS: 500, // Reading takes time
  HUMAN_READING_WPM: 250,

  // Message length
  MIN_AVG_MESSAGE_LENGTH: 10,
  MAX_AVG_MESSAGE_LENGTH: 2000,
  MIN_LENGTH_VARIANCE: 0.1, // Some variation expected

  // Vocabulary
  MIN_VOCABULARY_RICHNESS: 0.3, // Type-token ratio
  MIN_VOCABULARY_SIZE: 20,

  // Grammar/typos
  MAX_TYPO_RATE: 0.15, // 15% typo rate is very high
  MIN_TYPO_RATE: 0.001, // Some typos expected for humans
};

// Common stop words to filter for vocabulary analysis
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're",
  "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he',
  'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's",
  'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
  'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do',
  'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because',
  'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
  'just', 'don', "don't", 'should', "should've", 'now', 'd', 'll', 'm', 'o', 're',
  've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't", 'didn', "didn't",
  'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven', "haven't",
  'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn',
  "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 'wasn', "wasn't", 'weren',
  "weren't", 'won', "won't", 'wouldn', "wouldn't",
]);

// Patterns that indicate low-effort messages
const LOW_EFFORT_PATTERNS = [
  /^(hi|hello|hey|ok|okay|yes|no|yeah|yep|nope|sure|thanks|thank you|bye|goodbye)\.?$/i,
  /^(lol|lmao|rofl|haha|hehe|xd)$/i,
  /^\.+$/,  // Just dots
  /^\?+$/, // Just question marks
  /^!+$/, // Just exclamation marks
  /^[a-z]$/i, // Single letter
];

// =============================================================================
// CONVERSATION QUALITY ANALYZER CLASS
// =============================================================================

export class ConversationQualityAnalyzer {
  /**
   * Analyze a full conversation for quality metrics
   */
  public analyzeConversation(
    messages: Message[],
    character?: Character
  ): ConversationAnalysisResult {
    const userMessages = messages.filter((m) => m.role === 'USER');

    if (userMessages.length < 3) {
      return {
        score: 0,
        confidence: 0,
        metrics: {},
        flags: [],
        details: { reason: 'Insufficient messages for analysis' },
      };
    }

    const flags: string[] = [];
    let totalScore = 0;
    let factorCount = 0;

    // 1. Semantic coherence analysis
    const coherence = this.analyzeSemanticCoherence(userMessages);
    if (coherence < QUALITY_THRESHOLDS.MIN_COHERENCE) {
      flags.push(`Low semantic coherence: ${(coherence * 100).toFixed(1)}%`);
      totalScore += (1 - coherence) * 30;
    }
    factorCount++;

    // 2. Topic diversity
    const topicDiversity = this.analyzeTopicDiversity(userMessages);
    if (topicDiversity < QUALITY_THRESHOLDS.MIN_TOPIC_DIVERSITY) {
      flags.push(`Very repetitive topics: ${(topicDiversity * 100).toFixed(1)}%`);
      totalScore += 20;
    } else if (topicDiversity > QUALITY_THRESHOLDS.MAX_TOPIC_DIVERSITY) {
      flags.push(`Incoherent topic switching: ${(topicDiversity * 100).toFixed(1)}%`);
      totalScore += 15;
    }
    factorCount++;

    // 3. Response timing analysis
    const timingAnalysis = this.analyzeResponseTiming(messages);
    if (timingAnalysis.suspiciousCount > userMessages.length * 0.3) {
      flags.push(`Suspicious response timing: ${timingAnalysis.suspiciousCount}/${userMessages.length} messages`);
      totalScore += 25;
    }
    factorCount++;

    // 4. Message length analysis
    const lengthAnalysis = this.analyzeMessageLengths(userMessages);
    if (lengthAnalysis.mean < QUALITY_THRESHOLDS.MIN_AVG_MESSAGE_LENGTH) {
      flags.push(`Very short messages: avg ${lengthAnalysis.mean.toFixed(0)} chars`);
      totalScore += 20;
    }
    if (lengthAnalysis.variance < QUALITY_THRESHOLDS.MIN_LENGTH_VARIANCE) {
      flags.push(`Suspiciously consistent message lengths`);
      totalScore += 15;
    }
    factorCount++;

    // 5. Vocabulary analysis
    const vocabAnalysis = this.analyzeVocabulary(userMessages);
    if (vocabAnalysis.richness < QUALITY_THRESHOLDS.MIN_VOCABULARY_RICHNESS) {
      flags.push(`Limited vocabulary: ${(vocabAnalysis.richness * 100).toFixed(1)}% unique words`);
      totalScore += 15;
    }
    factorCount++;

    // 6. Low-effort message detection
    const lowEffortCount = this.countLowEffortMessages(userMessages);
    const lowEffortRatio = lowEffortCount / userMessages.length;
    if (lowEffortRatio > 0.5) {
      flags.push(`High low-effort message ratio: ${(lowEffortRatio * 100).toFixed(0)}%`);
      totalScore += 30;
    }
    factorCount++;

    // 7. Context retention analysis
    const contextRetention = this.analyzeContextRetention(messages);
    if (contextRetention < 0.2 && userMessages.length > 5) {
      flags.push(`Poor context retention: appears to ignore conversation history`);
      totalScore += 20;
    }
    factorCount++;

    // 8. Question rate analysis
    const questionRate = this.analyzeQuestionRate(userMessages);
    if (questionRate < 0.05 && userMessages.length > 5) {
      flags.push(`No questions asked: low engagement indicator`);
      totalScore += 10;
    }
    factorCount++;

    // 9. Character relevance (if character provided)
    let characterRelevance = 1;
    if (character) {
      characterRelevance = this.analyzeCharacterRelevance(userMessages, character);
      if (characterRelevance < 0.3) {
        flags.push(`Messages don't relate to character's domain`);
        totalScore += 15;
      }
    }
    factorCount++;

    // Calculate final score (normalized to 0-100)
    const normalizedScore = Math.min(100, totalScore);

    // Calculate confidence based on message count
    const confidence = Math.min(1, userMessages.length / 10);

    // Build metrics object
    const metrics: Partial<ConversationQuality> = {
      semanticCoherence: coherence,
      topicDiversity,
      contextRetention,
      questionRate,
      responseRelevance: characterRelevance,
      meanMessageLength: lengthAnalysis.mean,
      stdMessageLength: lengthAnalysis.std,
      vocabularyRichness: vocabAnalysis.richness,
      meanResponseTime: timingAnalysis.meanResponseTime,
      stdResponseTime: timingAnalysis.stdResponseTime,
      isLowQuality: normalizedScore > 50,
      qualityScore: 100 - normalizedScore, // Invert for quality score
    };

    return {
      score: normalizedScore,
      confidence,
      metrics,
      flags,
      details: {
        userMessageCount: userMessages.length,
        totalMessageCount: messages.length,
        timingAnalysis,
        lengthAnalysis,
        vocabAnalysis,
        lowEffortRatio,
      },
    };
  }

  // ===========================================================================
  // PRIVATE ANALYSIS METHODS
  // ===========================================================================

  /**
   * Analyze semantic coherence between consecutive messages
   * Uses simple n-gram overlap as a proxy for semantic similarity
   */
  private analyzeSemanticCoherence(messages: Message[]): number {
    if (messages.length < 2) return 1;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 1; i < messages.length; i++) {
      const prevWords = this.tokenize(messages[i - 1].content);
      const currWords = this.tokenize(messages[i].content);

      // Calculate Jaccard similarity
      const intersection = prevWords.filter((w) => currWords.includes(w));
      const union = new Set([...prevWords, ...currWords]);

      if (union.size > 0) {
        const similarity = intersection.length / union.size;
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    // Some semantic drift is expected, so normalize
    return comparisons > 0 ? Math.min(1, (totalSimilarity / comparisons) * 3) : 0;
  }

  /**
   * Analyze topic diversity using word entropy
   */
  private analyzeTopicDiversity(messages: Message[]): number {
    const allWords: string[] = [];
    for (const msg of messages) {
      allWords.push(...this.tokenize(msg.content));
    }

    if (allWords.length === 0) return 0;

    // Calculate word frequency distribution
    const freq: Record<string, number> = {};
    for (const word of allWords) {
      freq[word] = (freq[word] || 0) + 1;
    }

    // Calculate Shannon entropy
    const total = allWords.length;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize by max entropy
    const maxEntropy = Math.log2(Object.keys(freq).length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Analyze response timing for suspicious patterns
   */
  private analyzeResponseTiming(messages: Message[]): {
    meanResponseTime: number;
    stdResponseTime: number;
    suspiciousCount: number;
    details: Array<{ messageId: string; responseTime: number; expectedReadTime: number; suspicious: boolean }>;
  } {
    const responseTimes: number[] = [];
    const details: Array<{ messageId: string; responseTime: number; expectedReadTime: number; suspicious: boolean }> = [];

    for (let i = 1; i < messages.length; i++) {
      if (messages[i].role === 'USER' && messages[i - 1].role === 'ASSISTANT') {
        const responseTime = new Date(messages[i].createdAt).getTime() -
          new Date(messages[i - 1].createdAt).getTime();

        // Calculate expected reading time based on previous message length
        const prevContent = messages[i - 1].content;
        const wordCount = prevContent.split(/\s+/).length;
        const expectedReadTimeMs = (wordCount / QUALITY_THRESHOLDS.HUMAN_READING_WPM) * 60000;

        // Response faster than possible reading time is suspicious
        const suspicious = responseTime < Math.max(
          QUALITY_THRESHOLDS.MIN_RESPONSE_TIME_MS,
          expectedReadTimeMs * 0.3 // Allow for skimming
        );

        responseTimes.push(responseTime);
        details.push({
          messageId: messages[i].id,
          responseTime,
          expectedReadTime: expectedReadTimeMs,
          suspicious,
        });
      }
    }

    const mean = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    const variance = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / responseTimes.length
      : 0;

    return {
      meanResponseTime: mean,
      stdResponseTime: Math.sqrt(variance),
      suspiciousCount: details.filter((d) => d.suspicious).length,
      details,
    };
  }

  /**
   * Analyze message length patterns
   */
  private analyzeMessageLengths(messages: Message[]): {
    mean: number;
    std: number;
    variance: number;
    min: number;
    max: number;
  } {
    const lengths = messages.map((m) => m.content.length);

    if (lengths.length === 0) {
      return { mean: 0, std: 0, variance: 0, min: 0, max: 0 };
    }

    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / lengths.length;
    const std = Math.sqrt(variance);

    // Coefficient of variation (relative variance)
    const cv = mean > 0 ? std / mean : 0;

    return {
      mean,
      std,
      variance: cv, // Use CV as normalized variance
      min: Math.min(...lengths),
      max: Math.max(...lengths),
    };
  }

  /**
   * Analyze vocabulary richness
   */
  private analyzeVocabulary(messages: Message[]): {
    richness: number;
    uniqueWords: number;
    totalWords: number;
    entropy: number;
  } {
    const allWords: string[] = [];
    for (const msg of messages) {
      allWords.push(...this.tokenize(msg.content));
    }

    if (allWords.length === 0) {
      return { richness: 0, uniqueWords: 0, totalWords: 0, entropy: 0 };
    }

    const uniqueWords = new Set(allWords);
    const richness = uniqueWords.size / allWords.length; // Type-token ratio

    // Calculate vocabulary entropy
    const freq: Record<string, number> = {};
    for (const word of allWords) {
      freq[word] = (freq[word] || 0) + 1;
    }

    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / allWords.length;
      entropy -= p * Math.log2(p);
    }

    return {
      richness,
      uniqueWords: uniqueWords.size,
      totalWords: allWords.length,
      entropy,
    };
  }

  /**
   * Count messages that match low-effort patterns
   */
  private countLowEffortMessages(messages: Message[]): number {
    return messages.filter((msg) => {
      const content = msg.content.trim();

      // Check against low-effort patterns
      for (const pattern of LOW_EFFORT_PATTERNS) {
        if (pattern.test(content)) return true;
      }

      // Very short messages (< 5 chars)
      if (content.length < 5) return true;

      return false;
    }).length;
  }

  /**
   * Analyze context retention (references to earlier content)
   */
  private analyzeContextRetention(messages: Message[]): number {
    const userMessages = messages.filter((m) => m.role === 'USER');
    if (userMessages.length < 3) return 1;

    let referencesFound = 0;

    // Look for references to earlier messages
    for (let i = 2; i < messages.length; i++) {
      if (messages[i].role !== 'USER') continue;

      const currentWords = new Set(this.tokenize(messages[i].content));

      // Check if current message references earlier content
      for (let j = 0; j < i - 1; j++) {
        const earlierWords = this.tokenize(messages[j].content);
        const contentWords = earlierWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));

        // Check for meaningful word overlap (not just stop words)
        const overlap = contentWords.filter((w) => currentWords.has(w));
        if (overlap.length >= 2) {
          referencesFound++;
          break;
        }
      }
    }

    return referencesFound / (userMessages.length - 2);
  }

  /**
   * Analyze question rate in user messages
   */
  private analyzeQuestionRate(messages: Message[]): number {
    const questionCount = messages.filter((msg) => {
      const content = msg.content.trim();
      return content.includes('?') ||
        content.toLowerCase().startsWith('what') ||
        content.toLowerCase().startsWith('how') ||
        content.toLowerCase().startsWith('why') ||
        content.toLowerCase().startsWith('when') ||
        content.toLowerCase().startsWith('where') ||
        content.toLowerCase().startsWith('who') ||
        content.toLowerCase().startsWith('can you') ||
        content.toLowerCase().startsWith('could you') ||
        content.toLowerCase().startsWith('would you');
    }).length;

    return questionCount / messages.length;
  }

  /**
   * Analyze if messages relate to character's domain
   */
  private analyzeCharacterRelevance(messages: Message[], character: Character): number {
    // Extract keywords from character description
    const characterKeywords = new Set<string>();

    const addKeywords = (text: string) => {
      const words = this.tokenize(text).filter(
        (w) => !STOP_WORDS.has(w.toLowerCase()) && w.length > 3
      );
      words.forEach((w) => characterKeywords.add(w.toLowerCase()));
    };

    addKeywords(character.systemPrompt);
    addKeywords(character.name);
    character.traits.forEach(addKeywords);
    addKeywords(character.category);

    if (characterKeywords.size === 0) return 1;

    // Check how many messages contain character-relevant keywords
    let relevantMessages = 0;
    for (const msg of messages) {
      const words = this.tokenize(msg.content).map((w) => w.toLowerCase());
      const hasRelevantWord = words.some((w) => characterKeywords.has(w));
      if (hasRelevantWord) relevantMessages++;
    }

    return relevantMessages / messages.length;
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const conversationQualityAnalyzer = new ConversationQualityAnalyzer();
