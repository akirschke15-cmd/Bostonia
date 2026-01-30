/**
 * Behavioral Analytics - Database Schemas
 *
 * These schemas define the data structures for fraud detection analytics.
 * Designed to be added to the Prisma schema or used with a time-series database.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Raw behavioral event from client-side tracking
 */
export interface BehavioralEvent {
  id: string;
  userId: string;
  sessionId: string;
  eventType: BehavioralEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
}

export type BehavioralEventType =
  // Input Events
  | 'keystroke'
  | 'mouse_move'
  | 'mouse_click'
  | 'touch_start'
  | 'touch_move'
  | 'scroll'
  // Composition Events
  | 'message_start'
  | 'message_edit'
  | 'message_delete'
  | 'message_submit'
  // Navigation Events
  | 'page_view'
  | 'page_leave'
  | 'tab_focus'
  | 'tab_blur'
  // Engagement Events
  | 'character_view'
  | 'conversation_start'
  | 'message_read'
  | 'idle_start'
  | 'idle_end';

export interface EventMetadata {
  userAgent: string;
  ipAddress: string; // Hashed for privacy
  screenResolution: string;
  timezone: string;
  language: string;
  referrer?: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

// =============================================================================
// TYPING BEHAVIOR ANALYSIS
// =============================================================================

/**
 * Aggregated typing patterns for a user
 */
export interface TypingProfile {
  userId: string;
  // Inter-key timing statistics (milliseconds)
  meanInterKeyTime: number;
  stdInterKeyTime: number;
  medianInterKeyTime: number;
  p95InterKeyTime: number;
  // Digraph timings (common letter pairs)
  digraphTimings: Record<string, { mean: number; std: number; count: number }>;
  // Typing speed metrics
  meanWPM: number;
  stdWPM: number;
  // Error patterns
  backspaceRate: number; // Backspaces per 100 characters
  correctionRate: number; // Edit distance between drafts
  // Pause patterns
  meanPauseDuration: number; // Pauses > 500ms
  pauseFrequency: number; // Pauses per message
  // Burst patterns
  meanBurstLength: number; // Characters in continuous typing
  burstVariance: number;
  // Statistical consistency
  consistencyScore: number; // 0-1, higher = more bot-like consistency
  sampleCount: number;
  lastUpdated: Date;
}

/**
 * Single message composition event
 */
export interface MessageComposition {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  // Timing
  compositionStartTime: Date;
  compositionEndTime: Date;
  totalDurationMs: number;
  activeDurationMs: number; // Time actually typing
  // Keystrokes
  keystrokeCount: number;
  backspaceCount: number;
  pasteCount: number;
  // Edit history
  draftVersions: number;
  finalLength: number;
  maxLength: number; // Peak length before deletions
  // Focus
  focusLostCount: number;
  focusLostDurationMs: number;
  // Derived metrics
  effectiveWPM: number;
  rawWPM: number;
  editRatio: number; // (keystrokeCount - finalLength) / finalLength
  timestamp: Date;
}

// =============================================================================
// MOUSE/TOUCH BEHAVIOR ANALYSIS
// =============================================================================

/**
 * Mouse movement profile for a session
 */
export interface MouseProfile {
  userId: string;
  sessionId: string;
  // Movement statistics
  meanVelocity: number; // pixels/ms
  stdVelocity: number;
  meanAcceleration: number;
  stdAcceleration: number;
  // Trajectory analysis
  meanCurvature: number; // How curved are paths
  straightLineRatio: number; // Perfectly straight = bot-like
  jitterFrequency: number; // Small micro-movements
  // Click patterns
  meanClickInterval: number;
  stdClickInterval: number;
  doubleClickRate: number;
  // Hover behavior
  meanHoverTime: number;
  hoverCount: number;
  // Scroll patterns
  meanScrollSpeed: number;
  scrollJerkiness: number;
  // Entropy (randomness)
  spatialEntropy: number;
  temporalEntropy: number;
  timestamp: Date;
}

/**
 * Individual mouse movement sample
 */
export interface MouseMovementSample {
  x: number;
  y: number;
  timestamp: number;
  velocity?: number;
  acceleration?: number;
  angle?: number;
}

// =============================================================================
// SESSION BEHAVIOR ANALYSIS
// =============================================================================

/**
 * Session-level behavioral metrics
 */
export interface SessionProfile {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  durationMs: number;
  // Page navigation
  pageViews: number;
  uniquePages: number;
  meanTimeOnPage: number;
  stdTimeOnPage: number;
  // Interaction patterns
  messagessSent: number;
  conversationsStarted: number;
  charactersViewed: number;
  // Reading behavior
  estimatedReadingTime: number;
  actualTimeBeforeResponse: number;
  readingSpeedRatio: number; // < 1 = reading too fast (suspicious)
  // Idle patterns
  idlePeriods: number;
  totalIdleTime: number;
  meanIdleDuration: number;
  // Time patterns
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
  // Device fingerprint
  deviceFingerprint: string;
  ipHash: string;
  // Anomaly markers
  suspiciousFlags: string[];
  fraudScore: number;
  timestamp: Date;
}

// =============================================================================
// CONVERSATION QUALITY METRICS
// =============================================================================

/**
 * Quality metrics for a single conversation
 */
export interface ConversationQuality {
  id: string;
  conversationId: string;
  userId: string;
  characterId: string;
  // Semantic metrics
  semanticCoherence: number; // 0-1, message relevance to context
  topicDiversity: number; // Shannon entropy of topics
  topicDriftRate: number; // How quickly topics change
  // Engagement metrics
  emotionalDepth: number; // Sentiment variance
  questionRate: number; // Questions per message
  responseRelevance: number; // To character personality
  // Memory/context
  contextRetention: number; // References to earlier messages
  narrativeContinuity: number; // Story coherence
  characterConsistency: number; // Staying in character
  // Message patterns
  meanMessageLength: number;
  stdMessageLength: number;
  vocabularyRichness: number; // Type-token ratio
  grammarScore: number;
  typoRate: number;
  // Timing patterns
  meanResponseTime: number;
  stdResponseTime: number;
  responseTimeVariance: number;
  // Flags
  isLowQuality: boolean;
  qualityScore: number;
  timestamp: Date;
}

// =============================================================================
// STATISTICAL FINGERPRINTING
// =============================================================================

/**
 * Statistical fingerprint combining all behavioral signals
 */
export interface BehavioralFingerprint {
  userId: string;
  // Timing distributions
  messageTimingDistribution: DistributionStats;
  sessionDurationDistribution: DistributionStats;
  activeTimeDistribution: DistributionStats;
  // Vocabulary metrics
  vocabularySize: number;
  vocabularyEntropy: number;
  hapaxLegomena: number; // Words used only once
  averageWordLength: number;
  // Linguistic patterns
  functionWordFrequency: Record<string, number>;
  punctuationPatterns: Record<string, number>;
  sentenceComplexity: number;
  // Error patterns
  typoFrequency: number;
  commonMisspellings: string[];
  autocorrectPatterns: number;
  // Time-of-day patterns
  hourlyActivityDistribution: number[]; // 24-element array
  weekdayDistribution: number[]; // 7-element array
  // Consistency metrics
  behavioralConsistency: number; // Self-similarity over time
  evolutionRate: number; // How behavior changes
  // Computed
  fingerprintHash: string;
  confidence: number;
  sampleCount: number;
  lastUpdated: Date;
}

export interface DistributionStats {
  mean: number;
  std: number;
  median: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  coefficientOfVariation: number;
}

// =============================================================================
// NETWORK ANALYSIS
// =============================================================================

/**
 * User-Creator interaction edge for graph analysis
 */
export interface InteractionEdge {
  userId: string;
  creatorId: string;
  characterId: string;
  // Interaction counts
  conversationCount: number;
  totalMessages: number;
  totalSpend: number; // Credits/money spent
  // Timing
  firstInteraction: Date;
  lastInteraction: Date;
  meanInteractionGap: number;
  // Quality
  averageSessionDuration: number;
  averageConversationQuality: number;
  // Flags
  isSuspicious: boolean;
  suspicionReasons: string[];
}

/**
 * Suspicious cluster of users
 */
export interface UserCluster {
  id: string;
  // Members
  userIds: string[];
  size: number;
  // Cluster properties
  centroid: number[]; // Feature vector centroid
  density: number;
  silhouetteScore: number;
  // Shared characteristics
  sharedIpHashes: string[];
  sharedDeviceFingerprints: string[];
  sharedCreators: string[]; // Creators they all interact with
  sharedBehavioralPatterns: string[];
  // Temporal correlation
  activityCorrelation: number;
  registrationTimeSpread: number;
  // Risk assessment
  clusterRiskScore: number;
  riskFactors: string[];
  detectedAt: Date;
  status: 'pending_review' | 'confirmed_fraud' | 'legitimate' | 'dismissed';
}

/**
 * Potential collusion ring
 */
export interface CollusionRing {
  id: string;
  // Participants
  creatorId: string;
  suspectUserIds: string[];
  // Evidence
  evidence: CollusionEvidence[];
  totalSuspiciousRevenue: number;
  // Detection
  detectionMethod: string;
  confidenceScore: number;
  detectedAt: Date;
  // Resolution
  status: 'detected' | 'investigating' | 'confirmed' | 'false_positive';
  reviewedBy?: string;
  reviewedAt?: Date;
  notes?: string;
}

export interface CollusionEvidence {
  type: 'timing_correlation' | 'behavioral_similarity' | 'network_pattern' |
        'device_sharing' | 'ip_clustering' | 'registration_pattern';
  description: string;
  strength: number; // 0-1
  dataPoints: Record<string, unknown>;
}

// =============================================================================
// FRAUD SCORING
// =============================================================================

/**
 * Comprehensive fraud score for a user
 */
export interface FraudScore {
  userId: string;
  // Overall score
  overallScore: number; // 0-100, higher = more suspicious
  confidence: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  // Component scores (0-100 each)
  componentScores: {
    typingBehavior: number;
    mouseBehavior: number;
    sessionPatterns: number;
    conversationQuality: number;
    timingPatterns: number;
    networkAnalysis: number;
    deviceFingerprint: number;
    velocityChecks: number;
  };
  // Feature breakdown
  topRiskFactors: RiskFactor[];
  mitigatingFactors: string[];
  // History
  scoreHistory: Array<{ timestamp: Date; score: number }>;
  trend: 'improving' | 'stable' | 'worsening';
  // Actions
  recommendedAction: 'none' | 'monitor' | 'challenge' | 'restrict' | 'ban';
  actionsTaken: Array<{ action: string; timestamp: Date; by: string }>;
  // Metadata
  lastCalculated: Date;
  dataPoints: number;
  modelVersion: string;
}

export interface RiskFactor {
  factor: string;
  score: number;
  weight: number;
  evidence: string;
  remediation?: string;
}

// =============================================================================
// PRISMA SCHEMA EXTENSIONS
// =============================================================================

/**
 * These model definitions should be added to the Prisma schema.
 * Copy this to schema.prisma and run prisma migrate.
 */
export const PRISMA_SCHEMA_ADDITIONS = `
// ============================================================================
// BEHAVIORAL ANALYTICS (Fraud Detection)
// ============================================================================

model BehavioralEvent {
  id          String   @id @default(uuid())
  userId      String
  sessionId   String
  eventType   String
  timestamp   DateTime @default(now())
  payload     Json
  metadata    Json

  @@index([userId])
  @@index([sessionId])
  @@index([eventType])
  @@index([timestamp])
}

model UserTypingProfile {
  id                    String   @id @default(uuid())
  userId                String   @unique
  meanInterKeyTime      Float
  stdInterKeyTime       Float
  medianInterKeyTime    Float
  p95InterKeyTime       Float
  digraphTimings        Json     @default("{}")
  meanWPM               Float
  stdWPM                Float
  backspaceRate         Float
  correctionRate        Float
  meanPauseDuration     Float
  pauseFrequency        Float
  meanBurstLength       Float
  burstVariance         Float
  consistencyScore      Float
  sampleCount           Int
  lastUpdated           DateTime @updatedAt

  @@index([userId])
  @@index([consistencyScore])
}

model MessageComposition {
  id                    String   @id @default(uuid())
  userId                String
  conversationId        String
  messageId             String
  compositionStartTime  DateTime
  compositionEndTime    DateTime
  totalDurationMs       Int
  activeDurationMs      Int
  keystrokeCount        Int
  backspaceCount        Int
  pasteCount            Int
  draftVersions         Int
  finalLength           Int
  maxLength             Int
  focusLostCount        Int
  focusLostDurationMs   Int
  effectiveWPM          Float
  rawWPM                Float
  editRatio             Float
  timestamp             DateTime @default(now())

  @@index([userId])
  @@index([conversationId])
  @@index([timestamp])
}

model SessionProfile {
  id                    String   @id @default(uuid())
  userId                String
  startTime             DateTime
  endTime               DateTime?
  durationMs            Int
  pageViews             Int
  uniquePages           Int
  meanTimeOnPage        Float
  stdTimeOnPage         Float
  messagesSent          Int
  conversationsStarted  Int
  charactersViewed      Int
  estimatedReadingTime  Float
  actualTimeBeforeResponse Float
  readingSpeedRatio     Float
  idlePeriods           Int
  totalIdleTime         Int
  meanIdleDuration      Float
  hourOfDay             Int
  dayOfWeek             Int
  isWeekend             Boolean
  deviceFingerprint     String
  ipHash                String
  suspiciousFlags       String[]
  fraudScore            Float    @default(0)
  timestamp             DateTime @default(now())

  @@index([userId])
  @@index([startTime])
  @@index([fraudScore])
  @@index([deviceFingerprint])
  @@index([ipHash])
}

model ConversationQualityMetric {
  id                    String   @id @default(uuid())
  conversationId        String
  userId                String
  characterId           String
  semanticCoherence     Float
  topicDiversity        Float
  topicDriftRate        Float
  emotionalDepth        Float
  questionRate          Float
  responseRelevance     Float
  contextRetention      Float
  narrativeContinuity   Float
  characterConsistency  Float
  meanMessageLength     Float
  stdMessageLength      Float
  vocabularyRichness    Float
  grammarScore          Float
  typoRate              Float
  meanResponseTime      Float
  stdResponseTime       Float
  responseTimeVariance  Float
  isLowQuality          Boolean  @default(false)
  qualityScore          Float
  timestamp             DateTime @default(now())

  @@index([userId])
  @@index([conversationId])
  @@index([characterId])
  @@index([qualityScore])
  @@index([isLowQuality])
}

model UserBehavioralFingerprint {
  id                        String   @id @default(uuid())
  userId                    String   @unique
  messageTimingDistribution Json
  sessionDurationDistribution Json
  activeTimeDistribution    Json
  vocabularySize            Int
  vocabularyEntropy         Float
  hapaxLegomena             Int
  averageWordLength         Float
  functionWordFrequency     Json
  punctuationPatterns       Json
  sentenceComplexity        Float
  typoFrequency             Float
  commonMisspellings        String[]
  autocorrectPatterns       Int
  hourlyActivityDistribution Float[]
  weekdayDistribution       Float[]
  behavioralConsistency     Float
  evolutionRate             Float
  fingerprintHash           String
  confidence                Float
  sampleCount               Int
  lastUpdated               DateTime @updatedAt

  @@index([userId])
  @@index([fingerprintHash])
  @@index([behavioralConsistency])
}

model UserInteractionEdge {
  id                    String   @id @default(uuid())
  userId                String
  creatorId             String
  characterId           String
  conversationCount     Int
  totalMessages         Int
  totalSpend            Float
  firstInteraction      DateTime
  lastInteraction       DateTime
  meanInteractionGap    Float
  averageSessionDuration Float
  averageConversationQuality Float
  isSuspicious          Boolean  @default(false)
  suspicionReasons      String[]

  @@unique([userId, creatorId, characterId])
  @@index([userId])
  @@index([creatorId])
  @@index([characterId])
  @@index([isSuspicious])
}

model SuspiciousCluster {
  id                    String   @id @default(uuid())
  userIds               String[]
  size                  Int
  centroid              Float[]
  density               Float
  silhouetteScore       Float
  sharedIpHashes        String[]
  sharedDeviceFingerprints String[]
  sharedCreators        String[]
  sharedBehavioralPatterns String[]
  activityCorrelation   Float
  registrationTimeSpread Float
  clusterRiskScore      Float
  riskFactors           String[]
  detectedAt            DateTime @default(now())
  status                String   @default("pending_review")

  @@index([status])
  @@index([clusterRiskScore])
  @@index([detectedAt])
}

model CollusionRingDetection {
  id                    String   @id @default(uuid())
  creatorId             String
  suspectUserIds        String[]
  evidence              Json
  totalSuspiciousRevenue Float
  detectionMethod       String
  confidenceScore       Float
  detectedAt            DateTime @default(now())
  status                String   @default("detected")
  reviewedBy            String?
  reviewedAt            DateTime?
  notes                 String?

  @@index([creatorId])
  @@index([status])
  @@index([confidenceScore])
  @@index([detectedAt])
}

model UserFraudScore {
  id                    String   @id @default(uuid())
  userId                String   @unique
  overallScore          Float
  confidence            Float
  riskLevel             String
  typingBehaviorScore   Float
  mouseBehaviorScore    Float
  sessionPatternsScore  Float
  conversationQualityScore Float
  timingPatternsScore   Float
  networkAnalysisScore  Float
  deviceFingerprintScore Float
  velocityChecksScore   Float
  topRiskFactors        Json
  mitigatingFactors     String[]
  scoreHistory          Json
  trend                 String
  recommendedAction     String
  actionsTaken          Json
  lastCalculated        DateTime @default(now())
  dataPoints            Int
  modelVersion          String

  @@index([userId])
  @@index([overallScore])
  @@index([riskLevel])
  @@index([recommendedAction])
}
`;
