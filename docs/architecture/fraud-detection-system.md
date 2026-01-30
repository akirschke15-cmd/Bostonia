# Bostonia Fraud Detection System Architecture

## Executive Summary

This document outlines a comprehensive fraud detection system to protect Bostonia's creator revenue share program from manipulation. The system employs multiple layers of defense: real-time monitoring, batch analysis, machine learning-based anomaly detection, and human review workflows.

**Key Objectives:**
- Detect and prevent creators from artificially inflating usage metrics
- Maintain platform integrity while minimizing false positives
- Provide transparent appeal processes for legitimate creators
- Scale efficiently as the platform grows

---

## 1. System Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                              FRAUD DETECTION SYSTEM                                |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                         REAL-TIME DETECTION LAYER                           |  |
|  |  +-----------+  +-----------+  +-----------+  +-----------------------+     |  |
|  |  | Velocity  |  | Behavior  |  | Device    |  | Session               |     |  |
|  |  | Monitor   |  | Analyzer  |  | Fingerprnt|  | Validator             |     |  |
|  |  +-----+-----+  +-----+-----+  +-----+-----+  +-----------+-----------+     |  |
|  |        |              |              |                    |                 |  |
|  |        +-------+------+------+-------+--------------------+                 |  |
|  |                |                                                            |  |
|  |                v                                                            |  |
|  |        +-------------------------------+                                    |  |
|  |        |      Risk Score Engine        |                                    |  |
|  |        +---------------+---------------+                                    |  |
|  +------------------------|------------------------------------------------+   |
|                           |                                                    |
|                           v                                                    |
|  +-----------------------------------------------------------------------------+  |
|  |                    EVENT STREAM (Redis Streams / Kafka)                     |  |
|  +-----------------------------------------------------------------------------+  |
|           |                        |                        |                    |
|           v                        v                        v                    |
|  +-----------------+    +-----------------+    +---------------------------+     |
|  | BATCH ANALYSIS  |    |   ML PIPELINE   |    |    RESPONSE SYSTEM        |     |
|  |                 |    |                 |    |                           |     |
|  | * Pattern Mining|    | * Feature Store |    | * Auto-block              |     |
|  | * Graph Analysis|    | * Model Serving |    | * Throttle                |     |
|  | * Cohort Study  |    | * Training Jobs |    | * Flag for Review         |     |
|  | * Time Series   |    | * A/B Testing   |    | * Alert Creator           |     |
|  +--------+--------+    +--------+--------+    +-------------+-------------+     |
|           |                      |                          |                    |
|           +----------------------+--------------------------+                    |
|                                  |                                               |
|                                  v                                               |
|  +-----------------------------------------------------------------------------+  |
|  |                     HUMAN REVIEW & APPEAL SYSTEM                            |  |
|  |  +-----------------+  +-----------------+  +---------------------------+    |  |
|  |  |  Review Queue   |  |  Case Manager   |  |  Appeal Portal            |    |  |
|  |  +-----------------+  +-----------------+  +---------------------------+    |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Data Model Extensions

### 2.1 New Tables for Fraud Detection

Add these models to `packages/database/prisma/schema.prisma`:

```prisma
// ============================================================================
// FRAUD DETECTION SYSTEM
// ============================================================================

// Device fingerprinting and session tracking
model DeviceFingerprint {
  id                   String    @id @default(uuid())
  fingerprintHash      String    @unique  // Hash of collected signals
  userAgent            String?
  screenResolution     String?
  timezone             String?
  language             String?
  platform             String?
  webglRenderer        String?
  canvasHash           String?   // Canvas fingerprint
  audioHash            String?   // AudioContext fingerprint
  fonts                String[]  @default([])
  plugins              String[]  @default([])
  firstSeenAt          DateTime  @default(now())
  lastSeenAt           DateTime  @updatedAt

  // Relations
  sessions             UserSession[]

  @@index([fingerprintHash])
  @@index([firstSeenAt])
}

model UserSession {
  id                   String    @id @default(uuid())
  userId               String
  deviceFingerprintId  String?
  ipAddress            String
  ipCountry            String?
  ipCity               String?
  ipAsn                String?   // Autonomous System Number (ISP/hosting)
  isVpn                Boolean   @default(false)
  isProxy              Boolean   @default(false)
  isDatacenter         Boolean   @default(false)
  isTor                Boolean   @default(false)
  startedAt            DateTime  @default(now())
  endedAt              DateTime?
  lastActivityAt       DateTime  @default(now())

  // Behavioral metrics (updated in real-time)
  messageCount         Int       @default(0)
  avgTypingSpeedMs     Float?    // Average ms between keystrokes
  avgResponseTimeMs    Float?    // Average ms to respond to AI
  avgMessageLength     Float?
  uniqueCharacters     Int       @default(0)  // Distinct characters chatted with

  // Risk assessment
  riskScore            Float     @default(0)
  riskFactors          Json      @default("[]")

  // Relations
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceFingerprint    DeviceFingerprint? @relation(fields: [deviceFingerprintId], references: [id])
  events               FraudEvent[]

  @@index([userId])
  @@index([deviceFingerprintId])
  @@index([ipAddress])
  @@index([startedAt])
  @@index([riskScore])
}

// Granular interaction tracking for fraud analysis
model InteractionEvent {
  id                   String    @id @default(uuid())
  sessionId            String
  userId               String
  characterId          String
  creatorId            String    // Denormalized for query efficiency
  conversationId       String
  eventType            InteractionEventType

  // Timing data
  timestamp            DateTime  @default(now())
  messageContent       String?   // Hashed or truncated for privacy
  messageLength        Int?
  typingDurationMs     Int?      // How long user typed
  timeSinceLastMessage Int?      // Ms since last message in conversation

  // Context
  hourOfDay            Int       // 0-23
  dayOfWeek            Int       // 0-6
  isWeekend            Boolean

  @@index([userId, timestamp])
  @@index([characterId, timestamp])
  @@index([creatorId, timestamp])
  @@index([sessionId])
  @@index([eventType])
}

enum InteractionEventType {
  MESSAGE_SENT
  MESSAGE_RECEIVED
  CONVERSATION_STARTED
  CONVERSATION_ENDED
  CHARACTER_FAVORITED
  CHARACTER_RATED
}

// Aggregated metrics for batch analysis
model CreatorMetricsDaily {
  id                   String    @id @default(uuid())
  creatorId            String
  date                 DateTime  @db.Date

  // Volume metrics
  totalMessages        Int       @default(0)
  totalConversations   Int       @default(0)
  uniqueUsers          Int       @default(0)
  totalDurationMinutes Int       @default(0)

  // Quality metrics
  avgMessagesPerConv   Float     @default(0)
  avgConvDurationMin   Float     @default(0)
  returnUserRate       Float     @default(0)  // % users who came back

  // Suspicious activity counts
  singleMsgConvs       Int       @default(0)  // Conversations with only 1 user msg
  rapidFireSessions    Int       @default(0)  // Sessions with > 100 msgs/hour
  newAccountInteracts  Int       @default(0)  // Interactions from < 24hr accounts
  sameIpUsers          Int       @default(0)  // Unique users from same IP
  sameFingerprintUsers Int       @default(0)  // Unique users from same device

  // Revenue attribution
  revenueAttributed    Int       @default(0)  // Cents

  // Anomaly scores (computed by ML)
  volumeAnomalyScore   Float?
  patternAnomalyScore  Float?
  networkAnomalyScore  Float?
  overallRiskScore     Float?

  @@unique([creatorId, date])
  @@index([creatorId])
  @@index([date])
  @@index([overallRiskScore])
}

// User-to-User relationship graph for collusion detection
model UserRelationship {
  id                   String    @id @default(uuid())
  userAId              String
  userBId              String
  relationshipType     UserRelationType
  strength             Float     @default(0)  // 0-1 score

  // Shared attributes
  sharedIpAddresses    String[]  @default([])
  sharedDevices        String[]  @default([])
  sharedPaymentMethods String[]  @default([])
  mutualCharacters     String[]  @default([])  // Characters both interact with

  firstDetectedAt      DateTime  @default(now())
  lastUpdatedAt        DateTime  @updatedAt

  @@unique([userAId, userBId])
  @@index([userAId])
  @@index([userBId])
  @@index([relationshipType])
  @@index([strength])
}

enum UserRelationType {
  SAME_DEVICE       // Same device fingerprint
  SAME_IP           // Same IP address
  SAME_NETWORK      // Same /24 subnet or ASN
  PAYMENT_LINKED    // Shared payment method
  BEHAVIORAL_MATCH  // Similar behavioral patterns
  TEMPORAL_MATCH    // Always active at same times
  CREATOR_FAN       // One is creator, other fans their characters
}

// Fraud investigation cases
model FraudCase {
  id                   String    @id @default(uuid())
  caseNumber           String    @unique  // Human-readable: FRD-2024-00001
  status               FraudCaseStatus @default(OPEN)
  priority             FraudCasePriority @default(MEDIUM)

  // Subject(s)
  primaryUserId        String
  relatedUserIds       String[]  @default([])
  relatedCharacterIds  String[]  @default([])

  // Detection info
  detectionMethod      String    // "realtime_velocity", "batch_pattern", "ml_anomaly"
  triggerEventId       String?   // Original event that triggered
  triggerRuleId        String?   // Rule that was violated

  // Risk assessment
  initialRiskScore     Float
  currentRiskScore     Float
  estimatedImpact      Int       @default(0)  // Cents of potential fraud

  // Evidence
  evidenceSummary      String?   @db.Text
  evidenceData         Json      @default("{}")

  // Timeline
  detectedAt           DateTime  @default(now())
  assignedAt           DateTime?
  assignedTo           String?   // Admin user ID
  resolvedAt           DateTime?
  resolution           FraudCaseResolution?
  resolutionNotes      String?   @db.Text

  // Actions taken
  actionsTaken         FraudAction[]

  // Appeal
  appeal               FraudAppeal?

  @@index([status])
  @@index([priority])
  @@index([primaryUserId])
  @@index([detectedAt])
  @@index([assignedTo])
}

enum FraudCaseStatus {
  OPEN
  INVESTIGATING
  PENDING_REVIEW
  RESOLVED
  APPEALED
  CLOSED
}

enum FraudCasePriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum FraudCaseResolution {
  CONFIRMED_FRAUD
  SUSPECTED_FRAUD
  FALSE_POSITIVE
  INSUFFICIENT_EVIDENCE
  POLICY_VIOLATION
}

// Actions taken in response to fraud
model FraudAction {
  id                   String    @id @default(uuid())
  caseId               String
  actionType           FraudActionType
  targetUserId         String?
  targetCharacterId    String?

  // Details
  severity             String    // "warning", "temporary", "permanent"
  duration             Int?      // Duration in hours for temporary actions
  reason               String

  // Execution
  isAutomated          Boolean   @default(false)
  executedAt           DateTime  @default(now())
  executedBy           String?   // Admin user ID or "system"
  reversedAt           DateTime?
  reversedBy           String?
  reverseReason        String?

  // Relations
  case                 FraudCase @relation(fields: [caseId], references: [id])

  @@index([caseId])
  @@index([targetUserId])
  @@index([actionType])
  @@index([executedAt])
}

enum FraudActionType {
  REVENUE_HOLD          // Hold pending payouts
  REVENUE_CLAWBACK      // Reverse attributed revenue
  RATE_LIMIT            // Stricter rate limits
  SHADOW_BAN            // Don't count toward revenue
  TEMPORARY_SUSPEND     // Temporary account suspension
  PERMANENT_BAN         // Permanent ban
  PAYOUT_BLOCK          // Block future payouts
  WARNING_ISSUED        // Just a warning
  MONITORING_INCREASED  // Flag for closer monitoring
}

// Appeal process
model FraudAppeal {
  id                   String    @id @default(uuid())
  caseId               String    @unique
  appealNumber         String    @unique  // APL-2024-00001
  status               AppealStatus @default(SUBMITTED)

  // Appellant info
  userId               String
  contactEmail         String

  // Appeal content
  appealReason         String    @db.Text
  supportingEvidence   Json      @default("[]")  // Links, screenshots, etc.

  // Process
  submittedAt          DateTime  @default(now())
  acknowledgedAt       DateTime?
  reviewStartedAt      DateTime?
  reviewerId           String?

  // Internal notes (not visible to appellant)
  internalNotes        String?   @db.Text

  // Decision
  decision             AppealDecision?
  decisionReason       String?   @db.Text
  decidedAt            DateTime?
  decidedBy            String?

  // Follow-up
  compensationOffered  Int?      // Cents
  compensationAccepted Boolean?

  // Relations
  case                 FraudCase @relation(fields: [caseId], references: [id])

  @@index([userId])
  @@index([status])
  @@index([submittedAt])
}

enum AppealStatus {
  SUBMITTED
  ACKNOWLEDGED
  UNDER_REVIEW
  ADDITIONAL_INFO_REQUESTED
  DECIDED
  CLOSED
}

enum AppealDecision {
  UPHELD            // Original decision stands
  OVERTURNED        // Fraud finding reversed
  PARTIALLY_UPHELD  // Some actions reversed
  ESCALATED         // Sent to higher review
}

// Fraud detection rules (configurable)
model FraudRule {
  id                   String    @id @default(uuid())
  name                 String
  description          String?
  category             String    // "velocity", "behavioral", "network", "ml"
  isActive             Boolean   @default(true)

  // Rule definition
  ruleType             String    // "threshold", "pattern", "ml_score"
  ruleConfig           Json      // Rule-specific configuration

  // Thresholds
  warningThreshold     Float?
  blockThreshold       Float?

  // Actions
  autoAction           FraudActionType?
  requiresReview       Boolean   @default(true)

  // Performance tracking
  triggeredCount       Int       @default(0)
  falsePositiveCount   Int       @default(0)
  truePositiveCount    Int       @default(0)

  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([category])
  @@index([isActive])
}

// Real-time fraud events
model FraudEvent {
  id                   String    @id @default(uuid())
  sessionId            String?
  userId               String
  ruleId               String?
  eventType            String
  severity             String    // "low", "medium", "high", "critical"

  // Context
  details              Json
  riskScore            Float

  // Processing
  wasActioned          Boolean   @default(false)
  actionTaken          String?
  caseId               String?   // If escalated to a case

  timestamp            DateTime  @default(now())

  // Relations
  session              UserSession? @relation(fields: [sessionId], references: [id])

  @@index([userId])
  @@index([sessionId])
  @@index([eventType])
  @@index([severity])
  @@index([timestamp])
  @@index([caseId])
}
```

### 2.2 User Model Extensions

Add to existing User model:

```prisma
model User {
  // ... existing fields ...

  // Fraud detection additions
  trustScore           Float     @default(1.0)  // 0-1, starts at 1
  accountAge           DateTime  @default(now())
  verificationLevel    VerificationLevel @default(NONE)
  isUnderReview        Boolean   @default(false)
  fraudFlags           String[]  @default([])

  // Payment verification
  hasVerifiedPayment   Boolean   @default(false)
  paymentMethodHash    String?   // For detecting shared payment methods

  // Relations (add these)
  sessions             UserSession[]
  fraudCases           FraudCase[]
  fraudAppeals         FraudAppeal[]
}

enum VerificationLevel {
  NONE
  EMAIL_VERIFIED
  PHONE_VERIFIED
  PAYMENT_VERIFIED
  ID_VERIFIED
}
```

---

## 3. Real-Time Detection Layer

### 3.1 Service Architecture

```
+-------------------------------------------------------------------+
|                     REAL-TIME DETECTION LAYER                      |
+-------------------------------------------------------------------+
|                                                                   |
|  +------------------+     +------------------+     +-------------+ |
|  |   Chat Service   |     | Character Svc    |     | Auth Svc    | |
|  |   (WebSocket)    |     | (REST API)       |     | (JWT/OAuth) | |
|  +--------+---------+     +--------+---------+     +------+------+ |
|           |                        |                      |       |
|           +------------------------+----------------------+       |
|                                    |                              |
|                                    v                              |
|  +----------------------------------------------------------------+
|  |                    Fraud Detection Middleware                  |
|  |  +------------+  +------------+  +------------+  +-----------+ |
|  |  | Velocity   |  | Behavior   |  | Device     |  | Network   | |
|  |  | Checks     |  | Checks     |  | Checks     |  | Checks    | |
|  |  +-----+------+  +-----+------+  +-----+------+  +-----+-----+ |
|  |        |               |               |               |       |
|  |        +-------+-------+-------+-------+---------------+       |
|  |                |                                               |
|  |                v                                               |
|  |        +----------------+                                      |
|  |        | Risk Scoring   |                                      |
|  |        | Engine         |                                      |
|  |        +-------+--------+                                      |
|  |                |                                               |
|  +----------------|-----------------------------------------------+
|                   |                                               |
|                   v                                               |
|  +----------------------------------------------------------------+
|  |            Redis Streams (fraud:events)                        |
|  +----------------------------------------------------------------+
|                                                                   |
+-------------------------------------------------------------------+
```

### 3.2 Fraud Detection Middleware

Create `services/fraud-service/src/middleware/realtime-detection.ts`:

```typescript
import { Redis } from 'ioredis';
import { prisma } from '@bostonia/database';

interface DetectionContext {
  userId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint?: string;
  characterId?: string;
  creatorId?: string;
  action: 'message' | 'conversation_start' | 'rating' | 'favorite';
  metadata?: Record<string, unknown>;
}

interface RiskSignal {
  name: string;
  score: number;  // 0-1
  weight: number;
  details?: Record<string, unknown>;
}

interface RiskAssessment {
  overallScore: number;
  signals: RiskSignal[];
  action: 'allow' | 'throttle' | 'challenge' | 'block' | 'shadow';
  flags: string[];
}

// Velocity limits (per time window)
const VELOCITY_LIMITS = {
  messages_per_minute: 10,
  messages_per_hour: 100,
  conversations_per_hour: 20,
  conversations_per_day: 100,
  unique_characters_per_hour: 15,
  ratings_per_hour: 30,
};

// Risk thresholds
const RISK_THRESHOLDS = {
  throttle: 0.4,
  challenge: 0.6,  // CAPTCHA or email verification
  block: 0.8,
  shadow: 0.7,     // Count activity but don't pay creator
};

export class RealtimeDetectionService {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async assess(ctx: DetectionContext): Promise<RiskAssessment> {
    const signals: RiskSignal[] = [];
    const flags: string[] = [];

    // Run all checks in parallel
    const [
      velocitySignals,
      behaviorSignals,
      deviceSignals,
      networkSignals,
      relationshipSignals,
    ] = await Promise.all([
      this.checkVelocity(ctx),
      this.checkBehavior(ctx),
      this.checkDevice(ctx),
      this.checkNetwork(ctx),
      this.checkRelationships(ctx),
    ]);

    signals.push(...velocitySignals, ...behaviorSignals,
                 ...deviceSignals, ...networkSignals, ...relationshipSignals);

    // Calculate weighted risk score
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const overallScore = signals.reduce(
      (sum, s) => sum + (s.score * s.weight), 0
    ) / Math.max(totalWeight, 1);

    // Collect flags
    signals.forEach(s => {
      if (s.score > 0.5) {
        flags.push(s.name);
      }
    });

    // Determine action
    let action: RiskAssessment['action'] = 'allow';

    if (overallScore >= RISK_THRESHOLDS.block) {
      action = 'block';
    } else if (overallScore >= RISK_THRESHOLDS.shadow) {
      action = 'shadow';
    } else if (overallScore >= RISK_THRESHOLDS.challenge) {
      action = 'challenge';
    } else if (overallScore >= RISK_THRESHOLDS.throttle) {
      action = 'throttle';
    }

    // Log event to Redis stream for async processing
    await this.logEvent(ctx, { overallScore, signals, action, flags });

    return { overallScore, signals, action, flags };
  }

  private async checkVelocity(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    const day = Math.floor(now / 86400000);

    // Check message velocity
    if (ctx.action === 'message') {
      const [perMinute, perHour] = await Promise.all([
        this.redis.incr(`velocity:msg:${ctx.userId}:${minute}`),
        this.redis.incr(`velocity:msg:${ctx.userId}:${hour}`),
      ]);

      // Set expiry on first increment
      if (perMinute === 1) {
        await this.redis.expire(`velocity:msg:${ctx.userId}:${minute}`, 120);
      }
      if (perHour === 1) {
        await this.redis.expire(`velocity:msg:${ctx.userId}:${hour}`, 7200);
      }

      signals.push({
        name: 'high_message_velocity_minute',
        score: Math.min(perMinute / VELOCITY_LIMITS.messages_per_minute, 1),
        weight: 3,
        details: { count: perMinute, limit: VELOCITY_LIMITS.messages_per_minute },
      });

      signals.push({
        name: 'high_message_velocity_hour',
        score: Math.min(perHour / VELOCITY_LIMITS.messages_per_hour, 1),
        weight: 2,
        details: { count: perHour, limit: VELOCITY_LIMITS.messages_per_hour },
      });
    }

    // Check conversation start velocity
    if (ctx.action === 'conversation_start') {
      const [perHour, perDay] = await Promise.all([
        this.redis.incr(`velocity:conv:${ctx.userId}:${hour}`),
        this.redis.incr(`velocity:conv:${ctx.userId}:${day}`),
      ]);

      signals.push({
        name: 'high_conversation_velocity',
        score: Math.min(perHour / VELOCITY_LIMITS.conversations_per_hour, 1),
        weight: 2,
        details: { count: perHour, limit: VELOCITY_LIMITS.conversations_per_hour },
      });
    }

    // Check if user is interacting with own characters
    if (ctx.creatorId && ctx.creatorId === ctx.userId) {
      signals.push({
        name: 'self_interaction',
        score: 1.0,
        weight: 10,  // Very strong signal
        details: { characterId: ctx.characterId },
      });
    }

    return signals;
  }

  private async checkBehavior(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    // Get session behavioral data
    const session = await prisma.userSession.findUnique({
      where: { id: ctx.sessionId },
    });

    if (!session) return signals;

    // Check for robotic timing patterns
    if (session.avgTypingSpeedMs && session.avgTypingSpeedMs < 50) {
      signals.push({
        name: 'robotic_typing_speed',
        score: 1 - (session.avgTypingSpeedMs / 50),
        weight: 4,
        details: { avgMs: session.avgTypingSpeedMs },
      });
    }

    // Check for unnaturally consistent response times
    if (session.avgResponseTimeMs) {
      const variance = await this.getResponseTimeVariance(ctx.userId);
      if (variance < 100) {  // Less than 100ms variance is suspicious
        signals.push({
          name: 'consistent_response_time',
          score: 1 - (variance / 100),
          weight: 3,
          details: { variance },
        });
      }
    }

    // Check for new account
    const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
    if (user) {
      const accountAgeDays = (Date.now() - user.createdAt.getTime()) / 86400000;
      if (accountAgeDays < 1) {
        signals.push({
          name: 'new_account',
          score: 1 - (accountAgeDays),
          weight: 2,
          details: { ageDays: accountAgeDays },
        });
      }
    }

    return signals;
  }

  private async checkDevice(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    if (!ctx.deviceFingerprint) {
      signals.push({
        name: 'no_fingerprint',
        score: 0.3,
        weight: 1,
      });
      return signals;
    }

    // Check how many users share this device
    const usersWithDevice = await prisma.userSession.groupBy({
      by: ['userId'],
      where: { deviceFingerprintId: ctx.deviceFingerprint },
    });

    if (usersWithDevice.length > 1) {
      signals.push({
        name: 'shared_device',
        score: Math.min((usersWithDevice.length - 1) / 5, 1),
        weight: 5,
        details: { userCount: usersWithDevice.length },
      });
    }

    // Check if this device has been used for fraud before
    const fraudHistory = await prisma.fraudCase.count({
      where: {
        relatedUserIds: { hasSome: usersWithDevice.map(u => u.userId) },
        resolution: { in: ['CONFIRMED_FRAUD', 'SUSPECTED_FRAUD'] },
      },
    });

    if (fraudHistory > 0) {
      signals.push({
        name: 'device_fraud_history',
        score: Math.min(fraudHistory / 3, 1),
        weight: 8,
        details: { caseCount: fraudHistory },
      });
    }

    return signals;
  }

  private async checkNetwork(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    // Check for VPN/proxy/datacenter IP
    const ipInfo = await this.getIpInfo(ctx.ipAddress);

    if (ipInfo.isVpn || ipInfo.isProxy) {
      signals.push({
        name: 'vpn_or_proxy',
        score: 0.5,
        weight: 2,
        details: { type: ipInfo.isVpn ? 'vpn' : 'proxy' },
      });
    }

    if (ipInfo.isDatacenter) {
      signals.push({
        name: 'datacenter_ip',
        score: 0.8,
        weight: 4,
        details: { asn: ipInfo.asn },
      });
    }

    if (ipInfo.isTor) {
      signals.push({
        name: 'tor_exit_node',
        score: 0.7,
        weight: 3,
      });
    }

    // Check how many users share this IP
    const usersWithIp = await prisma.userSession.groupBy({
      by: ['userId'],
      where: { ipAddress: ctx.ipAddress },
      _count: true,
    });

    if (usersWithIp.length > 3) {  // Some sharing is normal (households, offices)
      signals.push({
        name: 'shared_ip',
        score: Math.min((usersWithIp.length - 3) / 10, 1),
        weight: 3,
        details: { userCount: usersWithIp.length },
      });
    }

    return signals;
  }

  private async checkRelationships(ctx: DetectionContext): Promise<RiskSignal[]> {
    const signals: RiskSignal[] = [];

    if (!ctx.creatorId) return signals;

    // Check for existing relationship with creator
    const relationship = await prisma.userRelationship.findFirst({
      where: {
        OR: [
          { userAId: ctx.userId, userBId: ctx.creatorId },
          { userAId: ctx.creatorId, userBId: ctx.userId },
        ],
      },
    });

    if (relationship) {
      const relationshipWeights: Record<string, number> = {
        SAME_DEVICE: 10,
        SAME_IP: 8,
        SAME_NETWORK: 4,
        PAYMENT_LINKED: 9,
        BEHAVIORAL_MATCH: 6,
        TEMPORAL_MATCH: 5,
        CREATOR_FAN: 0,  // This is expected
      };

      signals.push({
        name: `creator_relationship_${relationship.relationshipType.toLowerCase()}`,
        score: relationship.strength,
        weight: relationshipWeights[relationship.relationshipType] || 3,
        details: {
          type: relationship.relationshipType,
          strength: relationship.strength,
        },
      });
    }

    return signals;
  }

  private async getResponseTimeVariance(userId: string): Promise<number> {
    // Get recent response times from Redis
    const times = await this.redis.lrange(`behavior:response_times:${userId}`, 0, 99);
    if (times.length < 10) return 1000;  // Not enough data

    const values = times.map(t => parseInt(t, 10));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  private async getIpInfo(ip: string): Promise<{
    isVpn: boolean;
    isProxy: boolean;
    isDatacenter: boolean;
    isTor: boolean;
    asn: string | null;
    country: string | null;
  }> {
    // Check cache first
    const cached = await this.redis.get(`ip_info:${ip}`);
    if (cached) return JSON.parse(cached);

    // In production, integrate with an IP intelligence service like:
    // - MaxMind GeoIP2
    // - IPQualityScore
    // - ip-api.com
    // For now, return defaults
    const info = {
      isVpn: false,
      isProxy: false,
      isDatacenter: false,
      isTor: false,
      asn: null,
      country: null,
    };

    // Cache for 1 hour
    await this.redis.setex(`ip_info:${ip}`, 3600, JSON.stringify(info));

    return info;
  }

  private async logEvent(
    ctx: DetectionContext,
    assessment: RiskAssessment
  ): Promise<void> {
    await this.redis.xadd(
      'fraud:events',
      '*',
      'userId', ctx.userId,
      'sessionId', ctx.sessionId,
      'action', ctx.action,
      'riskScore', assessment.overallScore.toString(),
      'decision', assessment.action,
      'flags', JSON.stringify(assessment.flags),
      'signals', JSON.stringify(assessment.signals),
      'timestamp', Date.now().toString(),
    );
  }
}
```

### 3.3 Integration with Chat Service

Modify chat-service to include fraud detection:

```typescript
// In chat-service WebSocket handler
socket.on('chat:message', async (data) => {
  const { conversationId, content, userId } = data;

  // Get conversation and character info
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { character: { select: { creatorId: true } } },
  });

  // Fraud detection check
  const assessment = await fraudDetection.assess({
    userId,
    sessionId: socket.data.sessionId,
    ipAddress: socket.handshake.address,
    deviceFingerprint: socket.data.fingerprint,
    characterId: conversation.characterId,
    creatorId: conversation.character.creatorId,
    action: 'message',
    metadata: { contentLength: content.length },
  });

  // Handle based on assessment
  switch (assessment.action) {
    case 'block':
      return socket.emit('chat:error', {
        code: 'RATE_LIMITED',
        message: 'Please slow down. Try again in a few minutes.',
      });

    case 'challenge':
      return socket.emit('chat:challenge', {
        type: 'captcha',
        reason: 'Please verify you are human',
      });

    case 'throttle':
      // Add delay before processing
      await delay(1000 + Math.random() * 2000);
      break;

    case 'shadow':
      // Process normally but flag for non-payment
      socket.data.shadowBanned = true;
      break;
  }

  // Continue with normal message processing...
  // Mark interaction as shadow-banned if applicable
  await processMessage(data, { excludeFromRevenue: assessment.action === 'shadow' });
});
```

---

## 4. Batch Analysis Layer

### 4.1 Architecture

```
+-------------------------------------------------------------------+
|                       BATCH ANALYSIS LAYER                         |
+-------------------------------------------------------------------+
|                                                                   |
|  +---------------------------+    +---------------------------+   |
|  |    Scheduled Jobs         |    |    Ad-hoc Analysis        |   |
|  |    (Cron/BullMQ)          |    |    (Admin Dashboard)      |   |
|  +-------------+-------------+    +-------------+-------------+   |
|                |                                |                 |
|                +----------------+---------------+                 |
|                                 |                                 |
|                                 v                                 |
|  +---------------------------------------------------------------+|
|  |                    Analysis Engine                             ||
|  |                                                               ||
|  |  +------------+  +------------+  +------------+  +---------+  ||
|  |  | Pattern    |  | Graph      |  | Time       |  | Cohort  |  ||
|  |  | Mining     |  | Analysis   |  | Series     |  | Study   |  ||
|  |  +-----+------+  +-----+------+  +-----+------+  +----+----+  ||
|  |        |               |               |              |       ||
|  +--------|---------------|---------------|--------------|-------+|
|           |               |               |              |        |
|           v               v               v              v        |
|  +---------------------------------------------------------------+|
|  |                    PostgreSQL (Analytical Queries)             ||
|  +---------------------------------------------------------------+|
|           |                                                       |
|           v                                                       |
|  +---------------------------------------------------------------+|
|  |        Feature Store (Redis) / Data Warehouse (Optional)      ||
|  +---------------------------------------------------------------+|
|                                                                   |
+-------------------------------------------------------------------+
```

### 4.2 Batch Analysis Jobs

Create `services/fraud-service/src/jobs/batch-analysis.ts`:

```typescript
import { Queue, Worker } from 'bullmq';
import { prisma } from '@bostonia/database';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// Job definitions
export const batchAnalysisQueue = new Queue('fraud:batch-analysis', {
  connection: redis,
});

// Schedule daily jobs
export async function scheduleJobs() {
  // Daily metrics aggregation (run at 2 AM UTC)
  await batchAnalysisQueue.add(
    'aggregate-daily-metrics',
    {},
    { repeat: { pattern: '0 2 * * *' } }
  );

  // Collusion network analysis (run at 3 AM UTC)
  await batchAnalysisQueue.add(
    'analyze-collusion-networks',
    {},
    { repeat: { pattern: '0 3 * * *' } }
  );

  // Anomaly detection (run every 4 hours)
  await batchAnalysisQueue.add(
    'detect-anomalies',
    {},
    { repeat: { pattern: '0 */4 * * *' } }
  );

  // Creator risk scoring (run at 4 AM UTC)
  await batchAnalysisQueue.add(
    'score-creator-risk',
    {},
    { repeat: { pattern: '0 4 * * *' } }
  );
}

// Job handlers
export const batchAnalysisWorker = new Worker(
  'fraud:batch-analysis',
  async (job) => {
    switch (job.name) {
      case 'aggregate-daily-metrics':
        return aggregateDailyMetrics();
      case 'analyze-collusion-networks':
        return analyzeCollusionNetworks();
      case 'detect-anomalies':
        return detectAnomalies();
      case 'score-creator-risk':
        return scoreCreatorRisk();
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  },
  { connection: redis }
);

// ============================================================================
// DAILY METRICS AGGREGATION
// ============================================================================

async function aggregateDailyMetrics() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setDate(today.getDate() + 1);

  // Get all creators
  const creators = await prisma.user.findMany({
    where: { role: { in: ['CREATOR', 'ADMIN'] } },
    select: { id: true },
  });

  for (const creator of creators) {
    // Aggregate interactions for this creator's characters
    const metrics = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT ie."conversationId") as total_conversations,
        COUNT(*) FILTER (WHERE ie."eventType" = 'MESSAGE_SENT') as total_messages,
        COUNT(DISTINCT ie."userId") as unique_users,

        -- Suspicious patterns
        COUNT(*) FILTER (
          WHERE ie."eventType" = 'MESSAGE_SENT'
          AND ie."timeSinceLastMessage" < 1000
        ) as rapid_messages,

        COUNT(DISTINCT ie."conversationId") FILTER (
          WHERE ie."eventType" = 'CONVERSATION_ENDED'
          AND ie."messageLength" IS NULL
        ) as single_msg_convs,

        -- New account interactions
        COUNT(DISTINCT ie."userId") FILTER (
          WHERE EXISTS (
            SELECT 1 FROM "User" u
            WHERE u.id = ie."userId"
            AND u."createdAt" > NOW() - INTERVAL '24 hours'
          )
        ) as new_account_users

      FROM "InteractionEvent" ie
      WHERE ie."creatorId" = ${creator.id}
        AND ie."timestamp" >= ${yesterday}
        AND ie."timestamp" < ${today}
    `;

    // Calculate same-IP users
    const sameIpUsers = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT us."userId") as count
      FROM "UserSession" us
      WHERE us."userId" IN (
        SELECT DISTINCT ie."userId"
        FROM "InteractionEvent" ie
        WHERE ie."creatorId" = ${creator.id}
          AND ie."timestamp" >= ${yesterday}
          AND ie."timestamp" < ${today}
      )
      GROUP BY us."ipAddress"
      HAVING COUNT(DISTINCT us."userId") > 1
    `;

    // Save aggregated metrics
    await prisma.creatorMetricsDaily.upsert({
      where: {
        creatorId_date: {
          creatorId: creator.id,
          date: yesterday,
        },
      },
      create: {
        creatorId: creator.id,
        date: yesterday,
        totalMessages: Number(metrics[0]?.total_messages || 0),
        totalConversations: Number(metrics[0]?.total_conversations || 0),
        uniqueUsers: Number(metrics[0]?.unique_users || 0),
        singleMsgConvs: Number(metrics[0]?.single_msg_convs || 0),
        newAccountInteracts: Number(metrics[0]?.new_account_users || 0),
        sameIpUsers: sameIpUsers.length,
      },
      update: {
        totalMessages: Number(metrics[0]?.total_messages || 0),
        totalConversations: Number(metrics[0]?.total_conversations || 0),
        uniqueUsers: Number(metrics[0]?.unique_users || 0),
        singleMsgConvs: Number(metrics[0]?.single_msg_convs || 0),
        newAccountInteracts: Number(metrics[0]?.new_account_users || 0),
        sameIpUsers: sameIpUsers.length,
      },
    });
  }
}

// ============================================================================
// COLLUSION NETWORK ANALYSIS
// ============================================================================

async function analyzeCollusionNetworks() {
  // Find creators whose characters share many users
  const suspiciousCreatorPairs = await prisma.$queryRaw`
    WITH creator_users AS (
      SELECT
        c."creatorId",
        array_agg(DISTINCT conv."userId") as users
      FROM "Character" c
      JOIN "Conversation" conv ON conv."characterId" = c.id
      WHERE conv."createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY c."creatorId"
    )
    SELECT
      a."creatorId" as creator_a,
      b."creatorId" as creator_b,
      cardinality(a.users & b.users) as shared_users,
      cardinality(a.users | b.users) as total_users,
      cardinality(a.users & b.users)::float /
        NULLIF(cardinality(a.users | b.users), 0) as jaccard_similarity
    FROM creator_users a
    CROSS JOIN creator_users b
    WHERE a."creatorId" < b."creatorId"
      AND cardinality(a.users & b.users) > 5
      AND cardinality(a.users & b.users)::float /
          NULLIF(cardinality(a.users | b.users), 0) > 0.5
    ORDER BY jaccard_similarity DESC
    LIMIT 100
  `;

  // Create or update relationships
  for (const pair of suspiciousCreatorPairs) {
    await prisma.userRelationship.upsert({
      where: {
        userAId_userBId: {
          userAId: pair.creator_a,
          userBId: pair.creator_b,
        },
      },
      create: {
        userAId: pair.creator_a,
        userBId: pair.creator_b,
        relationshipType: 'BEHAVIORAL_MATCH',
        strength: pair.jaccard_similarity,
        mutualCharacters: [],
      },
      update: {
        strength: pair.jaccard_similarity,
      },
    });
  }

  // Find users who interact with same sets of creators in patterns
  const collusionRings = await prisma.$queryRaw`
    WITH user_creator_interactions AS (
      SELECT
        conv."userId",
        c."creatorId",
        COUNT(*) as interaction_count
      FROM "Conversation" conv
      JOIN "Character" c ON conv."characterId" = c.id
      WHERE conv."createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY conv."userId", c."creatorId"
    ),
    user_patterns AS (
      SELECT
        "userId",
        array_agg("creatorId" ORDER BY "creatorId") as creators_interacted
      FROM user_creator_interactions
      WHERE interaction_count > 3
      GROUP BY "userId"
    )
    SELECT
      creators_interacted,
      array_agg("userId") as users,
      COUNT(*) as user_count
    FROM user_patterns
    GROUP BY creators_interacted
    HAVING COUNT(*) > 3
      AND array_length(creators_interacted, 1) > 1
    ORDER BY user_count DESC
    LIMIT 50
  `;

  // Flag suspicious patterns for review
  for (const ring of collusionRings) {
    if (ring.user_count > 5) {
      // Create fraud case
      await createFraudCase({
        type: 'collusion_ring',
        users: ring.users,
        creators: ring.creators_interacted,
        evidence: {
          sharedUsers: ring.user_count,
          sharedCreators: ring.creators_interacted.length,
        },
      });
    }
  }
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

async function detectAnomalies() {
  // Get baseline metrics for comparison
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  // Get creators with metrics
  const creators = await prisma.creatorMetricsDaily.findMany({
    where: {
      date: yesterday,
      totalMessages: { gt: 0 },
    },
  });

  for (const todayMetrics of creators) {
    // Get historical baseline
    const historicalMetrics = await prisma.creatorMetricsDaily.findMany({
      where: {
        creatorId: todayMetrics.creatorId,
        date: { gte: thirtyDaysAgo, lt: yesterday },
      },
    });

    if (historicalMetrics.length < 7) continue;  // Not enough history

    // Calculate statistics
    const avgMessages = mean(historicalMetrics.map(m => m.totalMessages));
    const stdMessages = stddev(historicalMetrics.map(m => m.totalMessages));
    const avgUsers = mean(historicalMetrics.map(m => m.uniqueUsers));
    const stdUsers = stddev(historicalMetrics.map(m => m.uniqueUsers));

    // Detect anomalies (Z-score > 3)
    const messageZScore = (todayMetrics.totalMessages - avgMessages) / Math.max(stdMessages, 1);
    const userZScore = (todayMetrics.uniqueUsers - avgUsers) / Math.max(stdUsers, 1);

    // Volume anomaly
    let volumeAnomalyScore = 0;
    if (messageZScore > 3) {
      volumeAnomalyScore = Math.min((messageZScore - 3) / 5, 1);
    }

    // Pattern anomaly: messages/user ratio
    const msgsPerUser = todayMetrics.totalMessages / Math.max(todayMetrics.uniqueUsers, 1);
    const historicalMsgsPerUser = mean(
      historicalMetrics.map(m => m.totalMessages / Math.max(m.uniqueUsers, 1))
    );
    const patternAnomalyScore = Math.min(
      Math.abs(msgsPerUser - historicalMsgsPerUser) / historicalMsgsPerUser,
      1
    );

    // Network anomaly: suspicious user ratio
    const suspiciousRatio = (
      todayMetrics.sameIpUsers +
      todayMetrics.newAccountInteracts +
      todayMetrics.singleMsgConvs
    ) / Math.max(todayMetrics.uniqueUsers, 1);
    const networkAnomalyScore = Math.min(suspiciousRatio, 1);

    // Overall risk score
    const overallRiskScore = (
      volumeAnomalyScore * 0.3 +
      patternAnomalyScore * 0.3 +
      networkAnomalyScore * 0.4
    );

    // Update metrics with scores
    await prisma.creatorMetricsDaily.update({
      where: { id: todayMetrics.id },
      data: {
        volumeAnomalyScore,
        patternAnomalyScore,
        networkAnomalyScore,
        overallRiskScore,
      },
    });

    // Flag for review if high risk
    if (overallRiskScore > 0.7) {
      await createFraudCase({
        type: 'anomaly_detection',
        primaryUser: todayMetrics.creatorId,
        evidence: {
          volumeAnomalyScore,
          patternAnomalyScore,
          networkAnomalyScore,
          overallRiskScore,
          todayMetrics,
        },
      });
    }
  }
}

// ============================================================================
// CREATOR RISK SCORING
// ============================================================================

async function scoreCreatorRisk() {
  // Get all creators
  const creators = await prisma.user.findMany({
    where: { role: { in: ['CREATOR', 'ADMIN'] } },
  });

  for (const creator of creators) {
    // Get recent fraud events
    const recentEvents = await prisma.fraudEvent.count({
      where: {
        userId: creator.id,
        timestamp: { gte: new Date(Date.now() - 30 * 86400000) },
        severity: { in: ['medium', 'high', 'critical'] },
      },
    });

    // Get recent metrics
    const recentMetrics = await prisma.creatorMetricsDaily.findMany({
      where: {
        creatorId: creator.id,
        date: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      orderBy: { date: 'desc' },
      take: 30,
    });

    // Get relationships with suspicious users
    const suspiciousRelationships = await prisma.userRelationship.count({
      where: {
        OR: [
          { userAId: creator.id },
          { userBId: creator.id },
        ],
        strength: { gt: 0.5 },
        relationshipType: {
          in: ['SAME_DEVICE', 'SAME_IP', 'PAYMENT_LINKED'],
        },
      },
    });

    // Get fraud case history
    const fraudCases = await prisma.fraudCase.count({
      where: {
        primaryUserId: creator.id,
        resolution: { in: ['CONFIRMED_FRAUD', 'SUSPECTED_FRAUD'] },
      },
    });

    // Calculate trust score
    let trustScore = 1.0;

    // Deduct for fraud events (up to 0.3)
    trustScore -= Math.min(recentEvents * 0.05, 0.3);

    // Deduct for suspicious relationships (up to 0.2)
    trustScore -= Math.min(suspiciousRelationships * 0.1, 0.2);

    // Deduct for fraud cases (up to 0.4)
    trustScore -= Math.min(fraudCases * 0.2, 0.4);

    // Deduct for high anomaly scores (up to 0.2)
    const avgAnomalyScore = mean(
      recentMetrics.map(m => m.overallRiskScore || 0)
    );
    trustScore -= Math.min(avgAnomalyScore * 0.2, 0.2);

    // Boost for account age (up to 0.1)
    const accountAgeDays = (Date.now() - creator.createdAt.getTime()) / 86400000;
    trustScore += Math.min(accountAgeDays / 365, 0.1);

    // Boost for verification level
    const verificationBoosts = {
      NONE: 0,
      EMAIL_VERIFIED: 0.02,
      PHONE_VERIFIED: 0.05,
      PAYMENT_VERIFIED: 0.08,
      ID_VERIFIED: 0.1,
    };
    trustScore += verificationBoosts[creator.verificationLevel] || 0;

    // Clamp between 0 and 1
    trustScore = Math.max(0, Math.min(1, trustScore));

    // Update user trust score
    await prisma.user.update({
      where: { id: creator.id },
      data: { trustScore },
    });

    // Flag low-trust creators for review
    if (trustScore < 0.5 && !creator.isUnderReview) {
      await prisma.user.update({
        where: { id: creator.id },
        data: { isUnderReview: true },
      });

      await createFraudCase({
        type: 'low_trust_score',
        primaryUser: creator.id,
        evidence: {
          trustScore,
          recentEvents,
          suspiciousRelationships,
          fraudCases,
          avgAnomalyScore,
        },
      });
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length);
}

async function createFraudCase(params: {
  type: string;
  primaryUser?: string;
  users?: string[];
  creators?: string[];
  evidence: Record<string, unknown>;
}) {
  const caseNumber = await generateCaseNumber();

  await prisma.fraudCase.create({
    data: {
      caseNumber,
      status: 'OPEN',
      priority: params.type === 'collusion_ring' ? 'HIGH' : 'MEDIUM',
      primaryUserId: params.primaryUser || params.users?.[0] || '',
      relatedUserIds: params.users || [],
      relatedCharacterIds: [],
      detectionMethod: `batch_${params.type}`,
      initialRiskScore: 0.7,
      currentRiskScore: 0.7,
      evidenceSummary: `Detected via batch analysis: ${params.type}`,
      evidenceData: params.evidence,
    },
  });
}

async function generateCaseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.fraudCase.count({
    where: {
      caseNumber: { startsWith: `FRD-${year}` },
    },
  });
  return `FRD-${year}-${String(count + 1).padStart(5, '0')}`;
}
```

---

## 5. Machine Learning Pipeline

### 5.1 Architecture

```
+-------------------------------------------------------------------+
|                      ML PIPELINE ARCHITECTURE                      |
+-------------------------------------------------------------------+
|                                                                   |
|  +-------------------------+    +-------------------------+       |
|  |    Feature Store        |    |    Model Registry       |       |
|  |    (Redis + PG)         |    |    (MLflow/S3)          |       |
|  +------------+------------+    +------------+------------+       |
|               |                              |                    |
|               v                              v                    |
|  +-----------------------------------------------------------+   |
|  |                    Training Pipeline                       |   |
|  |  +------------+  +------------+  +------------+           |   |
|  |  | Feature    |  | Model      |  | Evaluation |           |   |
|  |  | Engineering|  | Training   |  | & Testing  |           |   |
|  |  +------------+  +------------+  +------------+           |   |
|  +-----------------------------------------------------------+   |
|               |                                                   |
|               v                                                   |
|  +-----------------------------------------------------------+   |
|  |                    Inference Pipeline                      |   |
|  |  +------------+  +------------+  +------------+           |   |
|  |  | Real-time  |  | Batch      |  | A/B        |           |   |
|  |  | Scoring    |  | Scoring    |  | Testing    |           |   |
|  |  +------------+  +------------+  +------------+           |   |
|  +-----------------------------------------------------------+   |
|                                                                   |
+-------------------------------------------------------------------+
```

### 5.2 Feature Engineering

```typescript
// services/fraud-service/src/ml/features.ts

interface UserFeatures {
  // Account features
  accountAgeDays: number;
  verificationLevel: number;  // 0-4
  hasPaymentVerified: boolean;

  // Activity features (30 day window)
  totalMessages: number;
  totalConversations: number;
  uniqueCharacters: number;
  uniqueCreators: number;
  avgMessagesPerConversation: number;
  avgConversationDuration: number;

  // Temporal features
  avgHourOfDay: number;
  hourOfDayStdDev: number;
  peakHour: number;
  weekdayRatio: number;  // % of activity on weekdays

  // Behavioral features
  avgTypingSpeed: number;
  typingSpeedStdDev: number;
  avgResponseTime: number;
  responseTimeStdDev: number;
  avgMessageLength: number;
  messageLengthStdDev: number;

  // Network features
  uniqueIpAddresses: number;
  uniqueDevices: number;
  vpnUsageRatio: number;
  datacenterIpRatio: number;

  // Relationship features
  creatorRelationships: number;
  suspiciousRelationships: number;
  sharedDeviceUsers: number;
  sharedIpUsers: number;
}

interface CreatorFeatures {
  // Account features
  accountAgeDays: number;
  totalCharacters: number;
  publicCharacters: number;
  avgCharacterRating: number;

  // Traffic features (30 day)
  totalMessages: number;
  totalConversations: number;
  totalUniqueUsers: number;
  avgDailyMessages: number;
  dailyMessageStdDev: number;

  // User quality features
  newAccountUserRatio: number;
  singleMsgConversationRatio: number;
  repeatUserRatio: number;
  avgUserAccountAge: number;

  // Traffic pattern features
  hourlyDistributionEntropy: number;
  dailyGrowthRate: number;
  weekendTrafficRatio: number;

  // Network features
  avgUsersPerIp: number;
  avgUsersPerDevice: number;
  vpnUserRatio: number;

  // Historical features
  previousFraudCases: number;
  previousWarnings: number;
  trustScore: number;
}

interface InteractionFeatures {
  // User features (subset)
  userAccountAgeDays: number;
  userVerificationLevel: number;
  userTrustScore: number;

  // Creator features (subset)
  creatorTrustScore: number;
  isOwnCharacter: boolean;

  // Session features
  sessionDuration: number;
  messagesInSession: number;
  uniqueCharactersInSession: number;

  // Real-time behavior
  currentTypingSpeed: number;
  currentResponseTime: number;
  messagesSentLastMinute: number;
  messagesSentLastHour: number;

  // Network features
  isVpn: boolean;
  isDatacenter: boolean;
  ipUserCount: number;
  deviceUserCount: number;

  // Relationship features
  hasCreatorRelationship: boolean;
  relationshipStrength: number;
}
```

### 5.3 Model Definitions

```python
# services/fraud-service/ml/models/anomaly_detector.py

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib

class CreatorAnomalyDetector:
    """
    Isolation Forest model for detecting anomalous creator behavior.
    """

    def __init__(self, contamination=0.1):
        self.model = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100,
            max_samples='auto',
            n_jobs=-1
        )
        self.scaler = StandardScaler()

    def fit(self, X: np.ndarray):
        """Train on historical creator metrics."""
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Returns anomaly scores. Lower (more negative) = more anomalous.
        """
        X_scaled = self.scaler.transform(X)
        return self.model.decision_function(X_scaled)

    def is_anomaly(self, X: np.ndarray) -> np.ndarray:
        """Returns binary predictions. -1 = anomaly, 1 = normal."""
        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)

    def save(self, path: str):
        joblib.dump({'model': self.model, 'scaler': self.scaler}, path)

    @classmethod
    def load(cls, path: str):
        data = joblib.load(path)
        detector = cls()
        detector.model = data['model']
        detector.scaler = data['scaler']
        return detector


class CollusionGraphDetector:
    """
    Graph-based model for detecting collusion networks.
    Uses community detection and suspicious pattern matching.
    """

    def __init__(self):
        self.suspicious_patterns = [
            'ring',         # A -> B -> C -> A (creators share users in ring)
            'hub_spoke',    # One user interacts with many related creators
            'clique',       # Group of users only interact with same creators
        ]

    def build_graph(self, relationships: list) -> nx.Graph:
        """Build user-creator interaction graph."""
        G = nx.Graph()

        for rel in relationships:
            G.add_edge(
                f"user:{rel['userId']}",
                f"creator:{rel['creatorId']}",
                weight=rel['interactionCount']
            )

        return G

    def detect_communities(self, G: nx.Graph) -> list:
        """Detect suspicious communities using Louvain algorithm."""
        import community as community_louvain

        partition = community_louvain.best_partition(G)

        # Find communities with suspicious characteristics
        communities = {}
        for node, comm_id in partition.items():
            if comm_id not in communities:
                communities[comm_id] = {'users': [], 'creators': []}

            if node.startswith('user:'):
                communities[comm_id]['users'].append(node[5:])
            else:
                communities[comm_id]['creators'].append(node[8:])

        suspicious = []
        for comm_id, members in communities.items():
            # Flag if many users share few creators
            if len(members['users']) > 3 and len(members['creators']) <= 2:
                suspicious.append({
                    'type': 'concentrated_traffic',
                    'users': members['users'],
                    'creators': members['creators'],
                    'score': len(members['users']) / len(members['creators'])
                })

            # Flag if perfect overlap (all users hit all creators)
            if len(members['users']) > 2 and len(members['creators']) > 1:
                # Check density
                # ...
                pass

        return suspicious


class FraudClassifier:
    """
    Gradient Boosting classifier for real-time fraud scoring.
    """

    def __init__(self):
        from sklearn.ensemble import GradientBoostingClassifier

        self.model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.1,
            max_depth=5,
            random_state=42
        )
        self.scaler = StandardScaler()
        self.feature_names = None

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: list = None):
        """
        Train on labeled fraud/non-fraud examples.
        y: 1 = fraud, 0 = legitimate
        """
        self.feature_names = feature_names
        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Returns probability of fraud [0, 1]."""
        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)[:, 1]

    def feature_importance(self) -> dict:
        """Returns feature importance rankings."""
        if self.feature_names is None:
            return {}

        importance = self.model.feature_importances_
        return dict(sorted(
            zip(self.feature_names, importance),
            key=lambda x: x[1],
            reverse=True
        ))

    def save(self, path: str):
        joblib.dump({
            'model': self.model,
            'scaler': self.scaler,
            'feature_names': self.feature_names
        }, path)

    @classmethod
    def load(cls, path: str):
        data = joblib.load(path)
        classifier = cls()
        classifier.model = data['model']
        classifier.scaler = data['scaler']
        classifier.feature_names = data['feature_names']
        return classifier
```

---

## 6. Response System

### 6.1 Automated Actions

```typescript
// services/fraud-service/src/response/actions.ts

import { prisma } from '@bostonia/database';
import { FraudActionType } from '@prisma/client';

interface ActionContext {
  caseId?: string;
  userId: string;
  reason: string;
  severity: 'warning' | 'temporary' | 'permanent';
  duration?: number;  // Hours for temporary actions
  isAutomated: boolean;
  executedBy?: string;
}

export class FraudResponseService {

  /**
   * Execute an automated or manual fraud response action.
   */
  async executeAction(
    actionType: FraudActionType,
    ctx: ActionContext
  ): Promise<void> {
    // Create action record
    const action = await prisma.fraudAction.create({
      data: {
        caseId: ctx.caseId,
        actionType,
        targetUserId: ctx.userId,
        severity: ctx.severity,
        duration: ctx.duration,
        reason: ctx.reason,
        isAutomated: ctx.isAutomated,
        executedBy: ctx.executedBy || 'system',
      },
    });

    // Execute the action
    switch (actionType) {
      case 'WARNING_ISSUED':
        await this.issueWarning(ctx.userId, ctx.reason);
        break;

      case 'REVENUE_HOLD':
        await this.holdRevenue(ctx.userId, ctx.reason);
        break;

      case 'REVENUE_CLAWBACK':
        await this.clawbackRevenue(ctx.userId, ctx.reason);
        break;

      case 'RATE_LIMIT':
        await this.applyRateLimit(ctx.userId, ctx.duration || 24);
        break;

      case 'SHADOW_BAN':
        await this.applyShadowBan(ctx.userId);
        break;

      case 'TEMPORARY_SUSPEND':
        await this.temporarySuspend(ctx.userId, ctx.duration || 24);
        break;

      case 'PERMANENT_BAN':
        await this.permanentBan(ctx.userId, ctx.reason);
        break;

      case 'PAYOUT_BLOCK':
        await this.blockPayouts(ctx.userId);
        break;

      case 'MONITORING_INCREASED':
        await this.increaseMonitoring(ctx.userId);
        break;
    }

    // Log to audit trail
    await this.logAuditEvent(action.id, actionType, ctx);
  }

  private async issueWarning(userId: string, reason: string): Promise<void> {
    // Update user flags
    await prisma.user.update({
      where: { id: userId },
      data: {
        fraudFlags: {
          push: `warning:${Date.now()}:${reason.substring(0, 100)}`,
        },
      },
    });

    // Send notification (email, in-app)
    await this.sendNotification(userId, {
      type: 'fraud_warning',
      title: 'Account Activity Notice',
      message: `We've detected unusual activity on your account. ` +
               `Please review our terms of service. Continued violations ` +
               `may result in account restrictions.`,
      reason: reason,
    });
  }

  private async holdRevenue(userId: string, reason: string): Promise<void> {
    // Mark pending payouts as held
    await prisma.user.update({
      where: { id: userId },
      data: {
        fraudFlags: { push: `revenue_hold:${Date.now()}` },
      },
    });

    // In production, update payment service to block payouts
    await this.sendNotification(userId, {
      type: 'revenue_hold',
      title: 'Payout Hold Notice',
      message: `Your pending payouts have been temporarily held ` +
               `while we review recent activity. This typically takes ` +
               `5-7 business days. You can contact support for more information.`,
    });
  }

  private async clawbackRevenue(userId: string, reason: string): Promise<void> {
    // Calculate fraudulent revenue to claw back
    const fraudulentMetrics = await prisma.creatorMetricsDaily.findMany({
      where: {
        creatorId: userId,
        overallRiskScore: { gt: 0.7 },
        date: { gte: new Date(Date.now() - 30 * 86400000) },
      },
    });

    const clawbackAmount = fraudulentMetrics.reduce(
      (sum, m) => sum + m.revenueAttributed,
      0
    );

    // Create negative credit transaction
    if (clawbackAmount > 0) {
      // In production, adjust creator balance
      await this.sendNotification(userId, {
        type: 'revenue_clawback',
        title: 'Revenue Adjustment Notice',
        message: `Following our review, $${(clawbackAmount / 100).toFixed(2)} ` +
                 `has been deducted from your earnings due to policy violations. ` +
                 `You may appeal this decision within 30 days.`,
      });
    }
  }

  private async applyRateLimit(userId: string, hours: number): Promise<void> {
    // Set stricter rate limits in Redis
    const redis = await getRedis();
    await redis.setex(
      `rate_limit:strict:${userId}`,
      hours * 3600,
      JSON.stringify({
        messages_per_minute: 3,
        messages_per_hour: 30,
        conversations_per_hour: 5,
      })
    );
  }

  private async applyShadowBan(userId: string): Promise<void> {
    // Mark user for shadow ban (activity doesn't count for revenue)
    await prisma.user.update({
      where: { id: userId },
      data: {
        fraudFlags: { push: `shadow_ban:${Date.now()}` },
      },
    });

    // Set flag in Redis for real-time checking
    const redis = await getRedis();
    await redis.set(`shadow_ban:${userId}`, '1');
  }

  private async temporarySuspend(userId: string, hours: number): Promise<void> {
    const suspendUntil = new Date(Date.now() + hours * 3600000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'SUSPENDED',
        fraudFlags: { push: `suspended:${Date.now()}:${suspendUntil.toISOString()}` },
      },
    });

    // Revoke all sessions
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    await this.sendNotification(userId, {
      type: 'temporary_suspension',
      title: 'Account Temporarily Suspended',
      message: `Your account has been temporarily suspended until ` +
               `${suspendUntil.toLocaleString()} due to policy violations. ` +
               `You can appeal this decision.`,
    });
  }

  private async permanentBan(userId: string, reason: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',  // Or add BANNED status
        fraudFlags: { push: `banned:${Date.now()}:${reason}` },
      },
    });

    // Revoke all sessions
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });

    // Mark all characters as banned
    await prisma.character.updateMany({
      where: { creatorId: userId },
      data: { status: 'BANNED' },
    });

    await this.sendNotification(userId, {
      type: 'permanent_ban',
      title: 'Account Permanently Banned',
      message: `Your account has been permanently banned for severe ` +
               `policy violations. You may submit an appeal within 30 days.`,
    });
  }

  private async blockPayouts(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        fraudFlags: { push: `payout_blocked:${Date.now()}` },
      },
    });
  }

  private async increaseMonitoring(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isUnderReview: true,
        fraudFlags: { push: `monitoring:${Date.now()}` },
      },
    });

    // Set flag for enhanced logging
    const redis = await getRedis();
    await redis.setex(`enhanced_monitoring:${userId}`, 30 * 86400, '1');
  }

  /**
   * Reverse a previously executed action.
   */
  async reverseAction(
    actionId: string,
    reversedBy: string,
    reason: string
  ): Promise<void> {
    const action = await prisma.fraudAction.findUnique({
      where: { id: actionId },
    });

    if (!action || action.reversedAt) {
      throw new Error('Action not found or already reversed');
    }

    // Reverse the specific action
    switch (action.actionType) {
      case 'SHADOW_BAN':
        const redis = await getRedis();
        await redis.del(`shadow_ban:${action.targetUserId}`);
        break;

      case 'TEMPORARY_SUSPEND':
      case 'PERMANENT_BAN':
        await prisma.user.update({
          where: { id: action.targetUserId! },
          data: { status: 'ACTIVE' },
        });
        break;

      case 'RATE_LIMIT':
        const redis2 = await getRedis();
        await redis2.del(`rate_limit:strict:${action.targetUserId}`);
        break;

      // Add other reversal logic...
    }

    // Mark action as reversed
    await prisma.fraudAction.update({
      where: { id: actionId },
      data: {
        reversedAt: new Date(),
        reversedBy,
        reverseReason: reason,
      },
    });
  }

  private async sendNotification(
    userId: string,
    notification: {
      type: string;
      title: string;
      message: string;
      reason?: string;
    }
  ): Promise<void> {
    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) return;

    // Queue email notification
    // In production, use email service
    console.log(`Sending ${notification.type} email to ${user.email}`);
  }

  private async logAuditEvent(
    actionId: string,
    actionType: FraudActionType,
    ctx: ActionContext
  ): Promise<void> {
    // Log to audit table or external logging service
    console.log('Audit:', { actionId, actionType, ...ctx });
  }
}
```

### 6.2 Decision Matrix

| Risk Score | User Type | Account Age | Action |
|------------|-----------|-------------|--------|
| 0.0 - 0.3 | Any | Any | Allow |
| 0.3 - 0.5 | Free | < 7 days | Rate limit |
| 0.3 - 0.5 | Paid | Any | Allow + monitor |
| 0.5 - 0.7 | Free | < 7 days | CAPTCHA challenge |
| 0.5 - 0.7 | Free | > 7 days | Rate limit + warning |
| 0.5 - 0.7 | Paid | Any | Warning + monitor |
| 0.7 - 0.85 | Any | < 30 days | Shadow ban (creator) |
| 0.7 - 0.85 | Any | > 30 days | Warning + human review |
| 0.85 - 0.95 | Any | Any | Revenue hold + human review |
| 0.95 - 1.0 | Any | Any | Immediate suspension + review |

---

## 7. Appeal Process

### 7.1 Appeal Flow

```
+-------------------------------------------------------------------+
|                        APPEAL PROCESS FLOW                         |
+-------------------------------------------------------------------+
|                                                                   |
|  +-------------+    +-------------+    +-------------+            |
|  |  Creator    |    |   System    |    |   Review    |            |
|  |  Submits    |--->|   Auto-     |--->|   Queue     |            |
|  |  Appeal     |    |   Acknowledge|   |             |            |
|  +-------------+    +-------------+    +------+------+            |
|                                               |                   |
|       +---------------------------------------+                   |
|       |                                                           |
|       v                                                           |
|  +-------------+    +-------------+    +-------------+            |
|  |  Assigned   |    |  Evidence   |    |  Decision   |            |
|  |  to         |--->|  Review &   |--->|  Made       |            |
|  |  Reviewer   |    |  Analysis   |    |             |            |
|  +-------------+    +-------------+    +------+------+            |
|                                               |                   |
|       +-------------------+-------------------+                   |
|       |                   |                   |                   |
|       v                   v                   v                   |
|  +----------+      +----------+      +-------------+              |
|  | Upheld   |      | Partial  |      | Overturned  |              |
|  | (Denied) |      | (Some    |      | (Approved)  |              |
|  |          |      | reversed)|      |             |              |
|  +----+-----+      +----+-----+      +------+------+              |
|       |                 |                   |                     |
|       +--------+--------+-------------------+                     |
|                |                                                  |
|                v                                                  |
|  +-----------------------------------------------------------+   |
|  |              Notification to Creator                       |   |
|  |  - Decision explanation                                    |   |
|  |  - Actions taken/reversed                                  |   |
|  |  - Compensation (if any)                                   |   |
|  |  - Future prevention guidance                              |   |
|  +-----------------------------------------------------------+   |
|                                                                   |
+-------------------------------------------------------------------+
```

### 7.2 Appeal Service

```typescript
// services/fraud-service/src/appeal/service.ts

import { prisma } from '@bostonia/database';
import { AppealStatus, AppealDecision } from '@prisma/client';

interface SubmitAppealInput {
  caseId: string;
  userId: string;
  contactEmail: string;
  appealReason: string;
  supportingEvidence?: {
    type: 'url' | 'text' | 'file';
    content: string;
    description?: string;
  }[];
}

interface ReviewAppealInput {
  appealId: string;
  reviewerId: string;
  decision: AppealDecision;
  decisionReason: string;
  actionsToReverse?: string[];  // Action IDs to reverse
  compensationAmount?: number;  // Cents
  internalNotes?: string;
}

export class AppealService {

  /**
   * Submit a new appeal for a fraud case.
   */
  async submitAppeal(input: SubmitAppealInput): Promise<string> {
    // Validate case exists and is appealable
    const fraudCase = await prisma.fraudCase.findUnique({
      where: { id: input.caseId },
      include: { appeal: true },
    });

    if (!fraudCase) {
      throw new Error('Fraud case not found');
    }

    if (fraudCase.primaryUserId !== input.userId) {
      throw new Error('You can only appeal cases against your account');
    }

    if (fraudCase.appeal) {
      throw new Error('An appeal has already been submitted for this case');
    }

    // Check appeal window (30 days)
    const daysSinceResolution = fraudCase.resolvedAt
      ? (Date.now() - fraudCase.resolvedAt.getTime()) / 86400000
      : 0;

    if (daysSinceResolution > 30) {
      throw new Error('Appeal window has expired (30 days)');
    }

    // Generate appeal number
    const appealNumber = await this.generateAppealNumber();

    // Create appeal
    const appeal = await prisma.fraudAppeal.create({
      data: {
        caseId: input.caseId,
        appealNumber,
        userId: input.userId,
        contactEmail: input.contactEmail,
        appealReason: input.appealReason,
        supportingEvidence: input.supportingEvidence || [],
        status: 'SUBMITTED',
      },
    });

    // Update case status
    await prisma.fraudCase.update({
      where: { id: input.caseId },
      data: { status: 'APPEALED' },
    });

    // Send acknowledgment email
    await this.sendAppealAcknowledgment(appeal);

    // Auto-acknowledge after brief delay
    setTimeout(async () => {
      await this.acknowledgeAppeal(appeal.id);
    }, 60000);  // 1 minute delay

    return appeal.id;
  }

  /**
   * Acknowledge receipt of an appeal.
   */
  async acknowledgeAppeal(appealId: string): Promise<void> {
    await prisma.fraudAppeal.update({
      where: { id: appealId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      },
    });

    const appeal = await prisma.fraudAppeal.findUnique({
      where: { id: appealId },
    });

    if (appeal) {
      await this.sendEmail(appeal.contactEmail, {
        subject: `Appeal ${appeal.appealNumber} Received`,
        template: 'appeal_acknowledged',
        data: {
          appealNumber: appeal.appealNumber,
          estimatedReviewTime: '5-7 business days',
        },
      });
    }
  }

  /**
   * Assign an appeal to a reviewer.
   */
  async assignAppeal(appealId: string, reviewerId: string): Promise<void> {
    await prisma.fraudAppeal.update({
      where: { id: appealId },
      data: {
        status: 'UNDER_REVIEW',
        reviewStartedAt: new Date(),
        reviewerId,
      },
    });
  }

  /**
   * Request additional information from appellant.
   */
  async requestAdditionalInfo(
    appealId: string,
    requestedInfo: string
  ): Promise<void> {
    const appeal = await prisma.fraudAppeal.update({
      where: { id: appealId },
      data: {
        status: 'ADDITIONAL_INFO_REQUESTED',
        internalNotes: prisma.raw(`
          COALESCE("internalNotes", '') || '\n\n[${new Date().toISOString()}]
          Requested additional info: ${requestedInfo}
        `),
      },
    });

    await this.sendEmail(appeal.contactEmail, {
      subject: `Additional Information Needed - Appeal ${appeal.appealNumber}`,
      template: 'appeal_info_request',
      data: {
        appealNumber: appeal.appealNumber,
        requestedInfo,
        responseDeadline: new Date(Date.now() + 7 * 86400000),
      },
    });
  }

  /**
   * Submit additional evidence for an appeal.
   */
  async addEvidence(
    appealId: string,
    userId: string,
    evidence: { type: string; content: string; description?: string }
  ): Promise<void> {
    const appeal = await prisma.fraudAppeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal || appeal.userId !== userId) {
      throw new Error('Appeal not found');
    }

    const currentEvidence = (appeal.supportingEvidence as any[]) || [];

    await prisma.fraudAppeal.update({
      where: { id: appealId },
      data: {
        supportingEvidence: [...currentEvidence, {
          ...evidence,
          addedAt: new Date().toISOString(),
        }],
        status: appeal.status === 'ADDITIONAL_INFO_REQUESTED'
          ? 'UNDER_REVIEW'
          : appeal.status,
      },
    });
  }

  /**
   * Review and decide on an appeal.
   */
  async reviewAppeal(input: ReviewAppealInput): Promise<void> {
    const appeal = await prisma.fraudAppeal.findUnique({
      where: { id: input.appealId },
      include: { case: { include: { actionsTaken: true } } },
    });

    if (!appeal) {
      throw new Error('Appeal not found');
    }

    // Update appeal with decision
    await prisma.fraudAppeal.update({
      where: { id: input.appealId },
      data: {
        status: 'DECIDED',
        decision: input.decision,
        decisionReason: input.decisionReason,
        decidedAt: new Date(),
        decidedBy: input.reviewerId,
        internalNotes: input.internalNotes,
        compensationOffered: input.compensationAmount,
      },
    });

    // Reverse specified actions if appeal succeeded
    if (input.decision !== 'UPHELD' && input.actionsToReverse?.length) {
      const responseService = new FraudResponseService();

      for (const actionId of input.actionsToReverse) {
        await responseService.reverseAction(
          actionId,
          input.reviewerId,
          `Reversed due to appeal decision: ${input.decision}`
        );
      }
    }

    // Update case resolution if overturned
    if (input.decision === 'OVERTURNED') {
      await prisma.fraudCase.update({
        where: { id: appeal.caseId },
        data: {
          resolution: 'FALSE_POSITIVE',
          status: 'CLOSED',
        },
      });

      // Restore trust score
      await prisma.user.update({
        where: { id: appeal.userId },
        data: {
          trustScore: { increment: 0.2 },  // Partial restoration
          isUnderReview: false,
        },
      });
    }

    // Send decision notification
    await this.sendDecisionNotification(appeal, input);
  }

  /**
   * Accept or decline compensation offer.
   */
  async respondToCompensation(
    appealId: string,
    userId: string,
    accepted: boolean
  ): Promise<void> {
    const appeal = await prisma.fraudAppeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal || appeal.userId !== userId) {
      throw new Error('Appeal not found');
    }

    if (!appeal.compensationOffered) {
      throw new Error('No compensation offered for this appeal');
    }

    await prisma.fraudAppeal.update({
      where: { id: appealId },
      data: {
        compensationAccepted: accepted,
        status: 'CLOSED',
      },
    });

    if (accepted && appeal.compensationOffered > 0) {
      // Credit compensation to user
      // In production, use payment service
      console.log(`Crediting ${appeal.compensationOffered} cents to user ${userId}`);
    }
  }

  /**
   * Get appeals for admin dashboard.
   */
  async getAppeals(options: {
    status?: AppealStatus[];
    reviewerId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options.page || 1;
    const limit = options.limit || 20;

    const where = {
      ...(options.status && { status: { in: options.status } }),
      ...(options.reviewerId && { reviewerId: options.reviewerId }),
    };

    const [appeals, total] = await Promise.all([
      prisma.fraudAppeal.findMany({
        where,
        include: {
          case: {
            select: {
              caseNumber: true,
              priority: true,
              estimatedImpact: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fraudAppeal.count({ where }),
    ]);

    return { appeals, total, page, limit };
  }

  // Helper methods

  private async generateAppealNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.fraudAppeal.count({
      where: { appealNumber: { startsWith: `APL-${year}` } },
    });
    return `APL-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  private async sendAppealAcknowledgment(appeal: any): Promise<void> {
    await this.sendEmail(appeal.contactEmail, {
      subject: `Appeal Submitted - ${appeal.appealNumber}`,
      template: 'appeal_submitted',
      data: {
        appealNumber: appeal.appealNumber,
        submittedAt: appeal.submittedAt,
      },
    });
  }

  private async sendDecisionNotification(
    appeal: any,
    decision: ReviewAppealInput
  ): Promise<void> {
    const templates: Record<AppealDecision, string> = {
      UPHELD: 'appeal_denied',
      OVERTURNED: 'appeal_approved',
      PARTIALLY_UPHELD: 'appeal_partial',
      ESCALATED: 'appeal_escalated',
    };

    await this.sendEmail(appeal.contactEmail, {
      subject: `Appeal Decision - ${appeal.appealNumber}`,
      template: templates[decision.decision],
      data: {
        appealNumber: appeal.appealNumber,
        decision: decision.decision,
        reason: decision.decisionReason,
        compensation: decision.compensationAmount,
      },
    });
  }

  private async sendEmail(
    to: string,
    email: { subject: string; template: string; data: any }
  ): Promise<void> {
    // In production, use email service
    console.log(`Sending email to ${to}:`, email);
  }
}
```

---

## 8. Implementation Priorities

### Phase 1: Foundation (Weeks 1-3)
**Priority: Critical**

1. **Data Model Setup**
   - Add fraud detection tables to Prisma schema
   - Run migrations
   - Set up indexes for performance

2. **Basic Real-time Detection**
   - Velocity limiting
   - Self-interaction detection
   - Session tracking

3. **Device Fingerprinting**
   - Client-side fingerprint collection
   - Server-side fingerprint storage and matching

### Phase 2: Enhanced Detection (Weeks 4-6)
**Priority: High**

1. **Network Analysis**
   - IP intelligence integration (MaxMind/IPQualityScore)
   - VPN/proxy detection
   - Datacenter IP detection

2. **Behavioral Analysis**
   - Typing pattern tracking
   - Response time analysis
   - Session pattern analysis

3. **Batch Analysis Jobs**
   - Daily metrics aggregation
   - Basic anomaly detection
   - Collusion pattern detection

### Phase 3: ML Pipeline (Weeks 7-10)
**Priority: Medium**

1. **Feature Store**
   - Feature engineering pipeline
   - Real-time feature computation
   - Historical feature storage

2. **Model Development**
   - Isolation Forest for anomaly detection
   - Gradient Boosting classifier
   - Graph-based collusion detection

3. **Model Serving**
   - Real-time inference integration
   - A/B testing framework
   - Model monitoring

### Phase 4: Response & Appeal (Weeks 11-13)
**Priority: Medium**

1. **Automated Response System**
   - Action execution framework
   - Decision matrix implementation
   - Notification system

2. **Admin Dashboard**
   - Case management interface
   - Review queue
   - Analytics dashboard

3. **Appeal System**
   - Creator appeal portal
   - Review workflow
   - Compensation processing

### Phase 5: Optimization (Ongoing)
**Priority: Low**

1. **Performance Tuning**
   - Query optimization
   - Caching strategies
   - Async processing

2. **Model Improvement**
   - Feedback loop from reviews
   - False positive reduction
   - New attack pattern detection

3. **Reporting & Analytics**
   - Fraud trend reports
   - ROI analysis
   - Compliance reporting

---

## 9. Metrics & Monitoring

### 9.1 Key Performance Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Detection Rate | > 95% | % of fraud cases detected |
| False Positive Rate | < 5% | % of legitimate users flagged |
| Time to Detection | < 24 hrs | Average time from fraud to detection |
| Time to Resolution | < 48 hrs | Average case resolution time |
| Appeal Success Rate | < 10% | % of appeals overturned |
| Revenue Protected | Track | $ prevented from fraudulent payouts |

### 9.2 Monitoring Dashboard

```
+-------------------------------------------------------------------+
|                    FRAUD DETECTION DASHBOARD                       |
+-------------------------------------------------------------------+
|                                                                   |
|  Real-time Metrics                    24h Trend                   |
|  +------------------+  +------------------+  +------------------+ |
|  | Active Sessions  |  | Flagged Events   |  | Blocked Actions  | |
|  |     12,847       |  |      347         |  |       23         | |
|  |    +2.3% [^]     |  |    -5.1% [v]     |  |    +12% [^]      | |
|  +------------------+  +------------------+  +------------------+ |
|                                                                   |
|  Case Status                                                      |
|  +--------------------------------------------------------------+|
|  | Open: 23  | Investigating: 12 | Pending Review: 8 | Today: 5 ||
|  +--------------------------------------------------------------+|
|                                                                   |
|  Top Risk Signals (Last 24h)                                     |
|  +--------------------------------------------------------------+|
|  | 1. self_interaction .............. 127 events (35%)          ||
|  | 2. shared_device .................. 89 events (24%)          ||
|  | 3. datacenter_ip .................. 67 events (18%)          ||
|  | 4. high_velocity .................. 45 events (12%)          ||
|  | 5. new_account .................... 38 events (10%)          ||
|  +--------------------------------------------------------------+|
|                                                                   |
|  Revenue at Risk                                                  |
|  +--------------------------------------------------------------+|
|  | Held: $12,450 | Under Review: $8,230 | Clawed Back: $3,100   ||
|  +--------------------------------------------------------------+|
|                                                                   |
+-------------------------------------------------------------------+
```

---

## 10. Security Considerations

### 10.1 Data Privacy

- **PII Handling**: Fingerprint data should be hashed, not stored raw
- **Data Retention**: Fraud data retained for 2 years, then anonymized
- **Access Control**: Fraud data access limited to authorized personnel
- **Audit Logging**: All access to fraud data is logged

### 10.2 Evasion Prevention

- **Rule Obfuscation**: Don't expose exact thresholds to users
- **Dynamic Limits**: Randomize rate limits slightly to prevent probing
- **Delayed Feedback**: Don't immediately indicate when fraud is detected
- **Behavioral Fingerprints**: Track patterns that are hard to fake

### 10.3 Operational Security

- **Separation of Duties**: Different teams for detection vs response
- **Escalation Paths**: Clear procedures for high-severity cases
- **Incident Response**: Documented procedures for fraud outbreaks
- **Regular Audits**: Quarterly review of fraud patterns and responses

---

## 11. Attack Vector Coverage

| Attack Vector | Detection Methods | Response |
|--------------|-------------------|----------|
| Creator bots own characters | Self-interaction detection, IP/device matching | Immediate shadow ban + revenue hold |
| Multiple accounts | Device fingerprinting, payment method linking | Link accounts, aggregate as single user |
| Click farms | Geographic patterns, timing analysis, device farms | Rate limiting + human review |
| Sophisticated bots | Behavioral biometrics, ML anomaly detection | Progressive restrictions |
| Creator collusion | Graph analysis, cohort patterns | Revenue hold + investigation |
| Free tier abuse | Account age weighting, verification requirements | Require verification for revenue |

---

## 12. Appendix: API Endpoints

### Fraud Service API

```
POST   /api/fraud/assess              # Real-time risk assessment
POST   /api/fraud/events              # Log fraud event
GET    /api/fraud/cases               # List cases (admin)
GET    /api/fraud/cases/:id           # Get case details
POST   /api/fraud/cases/:id/assign    # Assign to reviewer
POST   /api/fraud/cases/:id/resolve   # Resolve case
POST   /api/fraud/appeals             # Submit appeal
GET    /api/fraud/appeals             # List appeals (admin)
GET    /api/fraud/appeals/:id         # Get appeal details
POST   /api/fraud/appeals/:id/decide  # Decide appeal
GET    /api/fraud/metrics             # Dashboard metrics
GET    /api/fraud/reports             # Generate reports
```

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: System Architecture Team*
