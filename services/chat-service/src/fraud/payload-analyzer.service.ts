/**
 * Payload Analysis Service
 *
 * Analyzes message content for:
 * - Copy-paste detection
 * - Template-based message detection
 * - Semantic similarity analysis
 * - Spam and automation patterns
 */

import type { Redis } from 'ioredis';
import crypto from 'crypto';
import type {
  MessageAnalysis,
  MessageContentType,
  RiskLevel,
  ContentFlag,
} from '../types/fraud.types.js';

// Configuration
const SIMILARITY_THRESHOLD = 0.85;
const RECENT_MESSAGES_WINDOW = 3600; // 1 hour
const MAX_RECENT_MESSAGES = 50;
const MIN_MESSAGE_LENGTH_FOR_ANALYSIS = 20;

// Spam patterns
const SPAM_PATTERNS = [
  // URLs
  { pattern: /https?:\/\/\S+/gi, name: 'url', weight: 0.3 },
  // Multiple URLs
  { pattern: /(https?:\/\/\S+.*){3,}/gi, name: 'multiple_urls', weight: 0.6 },
  // Contact info patterns
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, name: 'phone', weight: 0.4 },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, name: 'email', weight: 0.4 },
  // Promotional keywords
  { pattern: /\b(free|discount|offer|limited|click here|subscribe|follow)\b/gi, name: 'promo', weight: 0.2 },
  // Repeated characters
  { pattern: /(.)\1{5,}/g, name: 'repeated_chars', weight: 0.3 },
  // All caps
  { pattern: /\b[A-Z]{10,}\b/g, name: 'all_caps', weight: 0.2 },
  // Excessive punctuation
  { pattern: /[!?]{3,}/g, name: 'excessive_punct', weight: 0.2 },
];

// Template patterns (common automated message structures)
const TEMPLATE_PATTERNS = [
  { pattern: /^(hey|hi|hello)[,!]?\s*(how are you|what's up)/i, name: 'greeting_template' },
  { pattern: /^(check out|visit|see)\s+(my|our)\s+\S+/i, name: 'promotion_template' },
  { pattern: /\{[^}]+\}/g, name: 'placeholder_pattern' },
  { pattern: /<[^>]+>/g, name: 'html_tags' },
];

export class PayloadAnalyzerService {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix = 'bostonia:payload') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  // ===========================================================================
  // MAIN ANALYSIS
  // ===========================================================================

  /**
   * Analyze a message for fraud indicators
   */
  async analyzeMessage(
    messageId: string,
    userId: string,
    content: string,
    metadata?: {
      typingDuration?: number;
      editCount?: number;
      pasteEvents?: number;
    }
  ): Promise<MessageAnalysis> {
    const flags: ContentFlag[] = [];
    let spamScore = 0;
    let automationScore = 0;

    // Check if message is too short for detailed analysis
    if (content.length < MIN_MESSAGE_LENGTH_FOR_ANALYSIS) {
      return this.createMinimalAnalysis(messageId, userId, content);
    }

    // Spam pattern detection
    const spamResult = this.detectSpamPatterns(content);
    spamScore = spamResult.score;
    flags.push(...spamResult.flags);

    // Template detection
    const templateResult = await this.detectTemplatePattern(userId, content);
    if (templateResult.isTemplate) {
      flags.push('TEMPLATE_MATCH');
      automationScore += 0.4;
    }

    // Copy-paste detection
    const copyPasteResult = this.detectCopyPaste(content, metadata);
    if (copyPasteResult.detected) {
      flags.push('COPY_PASTE');
      automationScore += copyPasteResult.confidence * 0.3;
    }

    // Semantic similarity to recent messages
    const similarityResult = await this.checkSemanticSimilarity(userId, content);
    if (similarityResult.score >= SIMILARITY_THRESHOLD) {
      flags.push('SEMANTIC_DUPLICATE');
      automationScore += 0.3;
    }

    // Check for rapid-fire messages
    const rapidFire = await this.checkRapidFireMessages(userId);
    if (rapidFire) {
      flags.push('RAPID_FIRE');
      automationScore += 0.2;
    }

    // Check for repetitive patterns
    const repetitive = await this.checkRepetitiveContent(userId, content);
    if (repetitive) {
      flags.push('REPETITIVE');
      automationScore += 0.2;
    }

    // Calculate typing speed if available
    let typingSpeed: number | null = null;
    if (metadata?.typingDuration && metadata.typingDuration > 0) {
      typingSpeed = content.length / (metadata.typingDuration / 1000);

      // Check for suspicious typing speed
      if (typingSpeed > 15) {
        // > 15 chars/sec is very fast
        automationScore += 0.2;
        flags.push('AUTOMATED_PATTERN');
      } else if (typingSpeed < 0.5 && content.length > 50) {
        // Very slow for long message might indicate copy-paste
        automationScore += 0.1;
      }
    }

    // Determine content type
    const contentType = this.classifyContent(spamScore, automationScore, flags);

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(spamScore, automationScore, flags);

    // Store message hash for future similarity checks
    await this.storeMessageForAnalysis(userId, content);

    const analysis: MessageAnalysis = {
      messageId,
      userId,
      content,
      isCopyPaste: copyPasteResult.detected,
      copyPasteConfidence: copyPasteResult.confidence,
      isTemplated: templateResult.isTemplate,
      templateId: templateResult.templateId,
      similarityScore: similarityResult.score,
      similarMessages: similarityResult.similarMessageIds,
      typingSpeed,
      editCount: metadata?.editCount || 0,
      pasteEvents: metadata?.pasteEvents || 0,
      contentType,
      spamScore,
      automationScore: Math.min(1, automationScore),
      riskLevel,
      flags,
    };

    return analysis;
  }

  // ===========================================================================
  // PATTERN DETECTION
  // ===========================================================================

  /**
   * Detect spam patterns in content
   */
  private detectSpamPatterns(content: string): { score: number; flags: ContentFlag[] } {
    let score = 0;
    const flags: ContentFlag[] = [];

    for (const { pattern, name, weight } of SPAM_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        score += weight * Math.min(1, matches.length / 3);

        // Map pattern names to flags
        if (name === 'url' || name === 'multiple_urls') {
          flags.push('URL_SPAM');
        }
        if (name === 'phone' || name === 'email') {
          flags.push('CONTACT_INFO_SPAM');
        }
        if (name === 'promo') {
          flags.push('PROMOTIONAL_CONTENT');
        }
      }
    }

    return { score: Math.min(1, score), flags };
  }

  /**
   * Detect template-based messages
   */
  private async detectTemplatePattern(
    userId: string,
    content: string
  ): Promise<{ isTemplate: boolean; templateId: string | null }> {
    // Check against known template patterns
    for (const { pattern, name } of TEMPLATE_PATTERNS) {
      if (pattern.test(content)) {
        return { isTemplate: true, templateId: name };
      }
    }

    // Check for user's repeated message structures
    const structureHash = this.getMessageStructureHash(content);
    const structureKey = `${this.keyPrefix}:structure:${userId}`;

    const existingCount = await this.redis.hincrby(structureKey, structureHash, 1);
    await this.redis.expire(structureKey, RECENT_MESSAGES_WINDOW);

    if (existingCount > 3) {
      return { isTemplate: true, templateId: `user_template_${structureHash.substring(0, 8)}` };
    }

    return { isTemplate: false, templateId: null };
  }

  /**
   * Get structure hash of message (preserving pattern but not content)
   */
  private getMessageStructureHash(content: string): string {
    // Replace specific content with placeholders
    const normalized = content
      .replace(/\b\d+\b/g, '<NUM>') // Numbers
      .replace(/https?:\/\/\S+/g, '<URL>') // URLs
      .replace(/\b[A-Z][a-z]+\b/g, '<WORD>') // Capitalized words
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase()
      .trim();

    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Detect copy-paste based on metadata
   */
  private detectCopyPaste(
    content: string,
    metadata?: { typingDuration?: number; pasteEvents?: number }
  ): { detected: boolean; confidence: number } {
    let confidence = 0;

    // Explicit paste events
    if (metadata?.pasteEvents && metadata.pasteEvents > 0) {
      confidence += 0.5;
    }

    // Very fast typing for long content
    if (metadata?.typingDuration && content.length > 100) {
      const typingSpeed = content.length / (metadata.typingDuration / 1000);
      if (typingSpeed > 20) {
        confidence += 0.4;
      }
    }

    // Content heuristics
    // Long message with no typos might be copy-pasted
    if (content.length > 200 && !this.hasTypoPatterns(content)) {
      confidence += 0.2;
    }

    return {
      detected: confidence >= 0.5,
      confidence: Math.min(1, confidence),
    };
  }

  /**
   * Check for common typo patterns
   */
  private hasTypoPatterns(content: string): boolean {
    // Common typos and corrections
    const typoPatterns = [
      /\b(teh|hte|taht|jsut|adn|nad|thnk|becuase)\b/i,
      /\s{2,}/, // Double spaces
      /[a-z]{2,}[A-Z][a-z]/, // Mid-word caps (indicates correction)
    ];

    return typoPatterns.some((pattern) => pattern.test(content));
  }

  // ===========================================================================
  // SIMILARITY ANALYSIS
  // ===========================================================================

  /**
   * Check semantic similarity to recent messages
   */
  private async checkSemanticSimilarity(
    userId: string,
    content: string
  ): Promise<{ score: number; similarMessageIds: string[] }> {
    const recentMessages = await this.getRecentMessages(userId);

    if (recentMessages.length === 0) {
      return { score: 0, similarMessageIds: [] };
    }

    const currentShingles = this.getShingles(content);
    const similarMessageIds: string[] = [];
    let maxSimilarity = 0;

    for (const recent of recentMessages) {
      const recentShingles = new Set(JSON.parse(recent.shingles) as string[]);
      const similarity = this.jaccardSimilarity(currentShingles, recentShingles);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      if (similarity >= SIMILARITY_THRESHOLD) {
        similarMessageIds.push(recent.id);
      }
    }

    return { score: maxSimilarity, similarMessageIds };
  }

  /**
   * Generate shingles (n-grams) for similarity comparison
   */
  private getShingles(content: string, n = 3): Set<string> {
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    const words = normalized.split(' ');
    const shingles = new Set<string>();

    for (let i = 0; i <= words.length - n; i++) {
      shingles.add(words.slice(i, i + n).join(' '));
    }

    return shingles;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 && set2.size === 0) return 1;
    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Get recent messages for comparison
   */
  private async getRecentMessages(
    userId: string
  ): Promise<Array<{ id: string; shingles: string }>> {
    const key = `${this.keyPrefix}:recent:${userId}`;
    const messages = await this.redis.lrange(key, 0, MAX_RECENT_MESSAGES - 1);

    return messages.map((m) => {
      try {
        return JSON.parse(m);
      } catch {
        return { id: '', shingles: '[]' };
      }
    });
  }

  /**
   * Store message for future analysis
   */
  private async storeMessageForAnalysis(userId: string, content: string): Promise<void> {
    const key = `${this.keyPrefix}:recent:${userId}`;
    const shingles = Array.from(this.getShingles(content));
    const messageId = crypto.randomUUID();

    await this.redis.lpush(
      key,
      JSON.stringify({ id: messageId, shingles: JSON.stringify(shingles) })
    );
    await this.redis.ltrim(key, 0, MAX_RECENT_MESSAGES - 1);
    await this.redis.expire(key, RECENT_MESSAGES_WINDOW);
  }

  // ===========================================================================
  // BEHAVIORAL ANALYSIS
  // ===========================================================================

  /**
   * Check for rapid-fire messaging
   */
  private async checkRapidFireMessages(userId: string): Promise<boolean> {
    const key = `${this.keyPrefix}:timestamps:${userId}`;
    const now = Date.now();

    // Get message timestamps from last 10 seconds
    const timestamps = await this.redis.zrangebyscore(key, now - 10000, now);

    // Add current timestamp
    await this.redis.zadd(key, now.toString(), now.toString());
    await this.redis.expire(key, 60);

    // More than 5 messages in 10 seconds is suspicious
    return timestamps.length >= 5;
  }

  /**
   * Check for repetitive content patterns
   */
  private async checkRepetitiveContent(userId: string, content: string): Promise<boolean> {
    const contentHash = crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');
    const key = `${this.keyPrefix}:hashes:${userId}`;

    const existingCount = await this.redis.hincrby(key, contentHash, 1);
    await this.redis.expire(key, RECENT_MESSAGES_WINDOW);

    return existingCount > 2;
  }

  // ===========================================================================
  // CLASSIFICATION
  // ===========================================================================

  /**
   * Classify content type based on analysis
   */
  private classifyContent(
    spamScore: number,
    automationScore: number,
    flags: ContentFlag[]
  ): MessageContentType {
    if (spamScore >= 0.7) return 'SPAM';
    if (automationScore >= 0.7) return 'AUTOMATED';
    if (flags.includes('TEMPLATE_MATCH')) return 'TEMPLATE';
    if (flags.includes('PROMOTIONAL_CONTENT')) return 'PROMOTIONAL';
    if (spamScore >= 0.4 || automationScore >= 0.4) return 'SUSPICIOUS';
    return 'NORMAL';
  }

  /**
   * Calculate risk level
   */
  private calculateRiskLevel(
    spamScore: number,
    automationScore: number,
    flags: ContentFlag[]
  ): RiskLevel {
    const combinedScore = (spamScore * 0.6) + (automationScore * 0.4);
    const flagPenalty = flags.length * 0.05;
    const totalScore = Math.min(1, combinedScore + flagPenalty);

    if (totalScore >= 0.7) return 'CRITICAL';
    if (totalScore >= 0.5) return 'HIGH';
    if (totalScore >= 0.3) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Create minimal analysis for short messages
   */
  private createMinimalAnalysis(
    messageId: string,
    userId: string,
    content: string
  ): MessageAnalysis {
    return {
      messageId,
      userId,
      content,
      isCopyPaste: false,
      copyPasteConfidence: 0,
      isTemplated: false,
      templateId: null,
      similarityScore: 0,
      similarMessages: [],
      typingSpeed: null,
      editCount: 0,
      pasteEvents: 0,
      contentType: 'NORMAL',
      spamScore: 0,
      automationScore: 0,
      riskLevel: 'LOW',
      flags: [],
    };
  }
}
