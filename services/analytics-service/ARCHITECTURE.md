# Bostonia Behavioral Analytics System

## Overview

This document describes the comprehensive behavioral analytics system designed to detect bot-like behavior and prevent fraud on Bostonia, an AI character chat platform. The system aims to distinguish legitimate human users from automated systems attempting to inflate creator revenue metrics.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [User Behavior Signals](#user-behavior-signals)
3. [Conversation Quality Metrics](#conversation-quality-metrics)
4. [Statistical Fingerprinting](#statistical-fingerprinting)
5. [Network Analysis](#network-analysis)
6. [Scoring System](#scoring-system)
7. [Implementation Details](#implementation-details)
8. [Privacy Considerations](#privacy-considerations)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    BehavioralCollector                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ Keystroke│ │  Mouse   │ │Navigation│ │   Composition    │   │   │
│  │  │ Tracker  │ │ Tracker  │ │ Tracker  │ │     Tracker      │   │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │   │
│  │       │            │            │                 │             │   │
│  │       └────────────┼────────────┼─────────────────┘             │   │
│  │                    ▼                                             │   │
│  │            Event Buffer → Batch Send (10s intervals)            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTPS POST /api/analytics/events
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ANALYTICS SERVICE (Backend)                       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Real-Time Processing Layer                      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │Event Ingestion│→│Typing Analyzer│→│ Immediate Fraud Detection │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────┼──────────────────────────────────┐ │
│  │                    Batch Processing Layer                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │Network Analyzer│ │Quality Analyzer│ │   Fingerprint Builder   │ │ │
│  │  └───────┬──────┘  └───────┬──────┘  └────────────┬─────────────┘ │ │
│  │          │                 │                       │               │ │
│  │          └─────────────────┼───────────────────────┘               │ │
│  │                            ▼                                        │ │
│  │                   Fraud Scoring Engine                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│  ┌─────────────────────────────────┼──────────────────────────────────┐ │
│  │                       Storage Layer                                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │ │
│  │  │ Time-Series  │  │   Profiles   │  │      Fraud Scores        │ │ │
│  │  │   Events     │  │   (Redis)    │  │       (PostgreSQL)       │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components

1. **Client-Side Collector** (`collectors/client-collector.ts`)
   - Runs in browser, collects behavioral signals
   - Batches events for efficient transmission
   - Privacy-preserving (hashes sensitive data)

2. **Analytics Pipeline** (`services/analytics-pipeline.service.ts`)
   - Ingests events from clients
   - Routes to appropriate analyzers
   - Manages real-time vs batch processing

3. **Detectors**
   - Typing Analyzer: Keystroke patterns
   - Conversation Quality Analyzer: Message coherence
   - Network Analyzer: User clustering & collusion

4. **Fraud Scoring Service** (`services/fraud-scoring.service.ts`)
   - Combines all signals into unified score
   - Applies weights and thresholds
   - Recommends actions

5. **Batch Analyzer** (`workers/batch-analyzer.ts`)
   - Scheduled jobs for network analysis
   - Cluster detection
   - Collusion ring identification

---

## User Behavior Signals

### 1. Typing Cadence and Patterns

**What We Track:**
- Inter-key intervals (time between keystrokes)
- Digraph timings (common letter pair timings)
- Backspace/correction frequency
- Typing burst patterns
- Pause frequency and duration

**Why It Works:**
Humans have characteristic typing patterns based on motor memory. Bots typically have:
- Too-consistent inter-key timing (low variance)
- Unnatural speed (>120 WPM sustained)
- No error corrections
- No thinking pauses

**Thresholds:**
```typescript
const HUMAN_TYPING = {
  MEAN_IKI_MIN: 100,      // milliseconds
  MEAN_IKI_MAX: 300,
  STD_IKI_MIN: 30,        // Bots are too consistent
  CV_MIN: 0.2,            // Coefficient of variation
  WPM_MAX: 120,
  BACKSPACE_RATE_MIN: 2,  // Per 100 chars
};
```

### 2. Mouse/Touch Movement Patterns

**What We Track:**
- Movement velocity and acceleration
- Path curvature (straight lines are suspicious)
- Jitter patterns (micro-movements)
- Click timing intervals
- Scroll behavior

**Why It Works:**
Human mouse movements are curved, variable, and include micro-corrections. Bots often:
- Move in perfectly straight lines
- Have mechanical timing
- Miss natural jitter

### 3. Session Behavior

**What We Track:**
- Page navigation patterns
- Time spent on pages
- Idle periods
- Focus/blur events
- Reading time vs message length

**Why It Works:**
Humans have variable attention patterns. Suspicious signals:
- No idle time in long sessions
- Responding faster than reading speed
- Uniform session durations
- Activity 24/7

### 4. Message Composition Patterns

**What We Track:**
- Total composition time
- Active vs inactive time
- Draft revisions
- Paste events
- Edit ratio

**Key Metric: Reading Speed Ratio**
```
ratio = actualTimeBeforeResponse / estimatedReadingTime
```
- Ratio < 0.3: Responding faster than possible reading time
- Ratio 0.8-2.0: Normal human range

---

## Conversation Quality Metrics

### 1. Semantic Coherence

**Algorithm:**
- Calculate Jaccard similarity between consecutive messages
- Normalize for expected topic drift
- Score: 0-1 (higher = more coherent)

**Suspicious:** Coherence < 0.3 indicates random/unrelated messages

### 2. Topic Diversity

**Algorithm:**
- Calculate Shannon entropy of word distribution
- Normalize by maximum entropy

**Suspicious:**
- Very low diversity (repetitive spam)
- Very high diversity (random noise)

### 3. Context Retention

**What We Check:**
- References to earlier messages
- Use of character's name/details
- Continuing narrative threads

**Suspicious:** Never referencing earlier content despite long conversation

### 4. Response Relevance

**What We Check:**
- Message relates to character's domain
- Keywords matching character description
- Appropriate emotional engagement

### 5. Low-Effort Detection

**Patterns:**
```typescript
const LOW_EFFORT_PATTERNS = [
  /^(hi|hello|hey|ok|okay|yes|no)\.?$/i,
  /^(lol|lmao|haha|xd)$/i,
  /^\.+$/,  // Just dots
];
```

---

## Statistical Fingerprinting

### Message Timing Distribution

**What We Analyze:**
```typescript
interface DistributionStats {
  mean: number;
  std: number;
  median: number;
  skewness: number;    // Humans have slight right skew
  kurtosis: number;    // Humans have higher kurtosis
  coefficientOfVariation: number;
}
```

**Suspicious:**
- CV < 0.2 (too consistent)
- Skewness near 0 (perfect normal distribution)
- Activity uniformly distributed across 24 hours

### Vocabulary Analysis

**Metrics:**
- Type-Token Ratio (vocabulary richness)
- Hapax legomena (words used only once)
- Function word frequency
- Sentence complexity

**Suspicious:**
- Very limited vocabulary
- No function word variation
- Unnatural word distribution

### Grammar and Typo Patterns

**What We Track:**
- Common misspelling patterns
- Autocorrect signatures
- Punctuation patterns

**Why It Matters:**
Humans make characteristic errors. No errors or unnatural error patterns indicate automation.

---

## Network Analysis

### User-Creator Interaction Graphs

```
User Nodes          Creator Nodes
    ●───────────────────●
    │\                 /│
    │ \               / │
    │  \             /  │
    ●───●───────────●───●
       (Suspicious cluster)
```

### Cluster Detection Algorithm

**DBSCAN-style clustering with custom distance:**

```typescript
distance = 1.0
  - sharedIPs * 0.2 * IP_WEIGHT
  - sharedDevices * 0.15 * DEVICE_WEIGHT
  - activityCorrelation * 0.3 * CORRELATION_WEIGHT
  - behavioralSimilarity * 0.3
  - registrationProximity * 0.2
```

### Collusion Ring Detection

**Evidence Types:**
1. **Registration Pattern:** Many accounts created in short window
2. **Timing Correlation:** Activity spikes at same times
3. **Behavioral Similarity:** Similar typing/interaction patterns
4. **Device Sharing:** Same fingerprint across accounts
5. **IP Clustering:** Same IP ranges

**Detection Flow:**
```
For each creator:
  1. Calculate new account revenue ratio
  2. Check for focused clusters
  3. Analyze registration patterns
  4. Compare user behavioral vectors
  5. Score confidence (0-1)
  6. If confidence > 0.6: Flag for review
```

---

## Scoring System

### Component Weights

```typescript
const DEFAULT_WEIGHTS = {
  typing: 0.20,       // 20% - Typing patterns
  mouse: 0.10,        // 10% - Mouse/touch patterns
  session: 0.15,      // 15% - Session behavior
  conversation: 0.20, // 20% - Conversation quality
  timing: 0.10,       // 10% - Timing patterns
  network: 0.15,      // 15% - Network/cluster analysis
  device: 0.05,       // 5%  - Device fingerprinting
  velocity: 0.05,     // 5%  - Velocity checks
};
```

### Risk Levels

| Score | Level | Action |
|-------|-------|--------|
| 0-25 | Low | None |
| 25-50 | Medium | Monitor |
| 50-75 | High | Challenge (CAPTCHA) |
| 75-100 | Critical | Restrict/Ban |

### Threshold Calibration

**ROC Analysis:**
```typescript
calibrateThresholds(labeledData: Array<{score, isBot}>)
  For threshold 20 to 80:
    Calculate precision, recall, F1
  Return threshold with best F1 score
```

### False Positive/Negative Tradeoffs

**Tuning Priorities:**
1. **Low false positives** - Don't ban legitimate users
2. **Acceptable false negatives** - Some bots slip through

**Recommended F1 target:** 0.85+

---

## Implementation Details

### Client-Side vs Server-Side

| Signal | Client | Server | Reason |
|--------|--------|--------|--------|
| Keystrokes | ✓ | | Browser-only event |
| Mouse | ✓ | | Browser-only event |
| Composition | ✓ | | Track in real-time |
| Reading time | ✓ | | Visible in browser |
| Session profile | | ✓ | Aggregate on end |
| Conversation quality | | ✓ | Needs full context |
| Network analysis | | ✓ | Needs all user data |
| Fraud score | | ✓ | Secure calculation |

### Data Pipeline

```
Client Events (JSON, ~1KB each)
    │
    ▼ Batch (10s interval)
Event Buffer
    │
    ▼ HTTPS POST
API Gateway (rate limited)
    │
    ▼ Validate & Hash PII
Redis Stream (real-time)
    │
    ├──► Typing Analyzer (immediate)
    │         │
    │         ▼ If suspicious
    │    Update Fraud Score
    │
    ▼ 30s batch
PostgreSQL (raw events)
    │
    ▼ Scheduled (hourly)
Batch Analyzer
    │
    ├──► Cluster Detection
    ├──► Collusion Detection
    ├──► Fingerprint Updates
    └──► Score Recalculation
```

### Real-Time vs Batch Processing

**Real-Time (< 1s):**
- Typing pattern analysis
- Velocity checks
- Immediate suspicious activity

**Near Real-Time (30s):**
- Session profile updates
- Composition metrics

**Batch (hourly/daily):**
- Network graph analysis
- Cluster detection
- Fingerprint evolution
- Full score recalculation

---

## Privacy Considerations

### GDPR Compliance

1. **Data Minimization**
   - Only collect necessary signals
   - Hash PII (IPs) before storage
   - Don't store actual typed content

2. **Purpose Limitation**
   - Data used only for fraud detection
   - No marketing/analytics repurposing

3. **Storage Limitation**
   - Events retained 90 days
   - Profiles retained while account active
   - Full deletion on account deletion

4. **User Rights**
   - Right to access: Export fraud profile
   - Right to erasure: Delete all analytics data
   - Right to rectification: Appeal fraud flags

### Implementation

```typescript
// Hash sensitive data before storage
const ipHash = hashString(req.ip);

// Sanitize keystrokes - don't log actual characters
if (key.length === 1) return 'letter'; // Not 'a', 'b', etc.

// Retention policy
const retentionDate = new Date();
retentionDate.setDate(retentionDate.getDate() - 90);
await db.behavioralEvent.deleteMany({
  where: { timestamp: { lt: retentionDate } }
});
```

### Transparency

- Privacy policy explains behavioral tracking
- Users informed of anti-fraud measures
- Appeal process for false positives

---

## API Reference

### Client Events Endpoint

```http
POST /api/analytics/events
Content-Type: application/json

{
  "sessionId": "sess_12345",
  "userId": "user_67890",
  "timestamp": 1706534400000,
  "events": [
    {
      "eventType": "keystroke_batch",
      "timestamp": 1706534395000,
      "payload": {
        "keystrokes": [...],
        "timings": { "mean": 120, "std": 45 }
      },
      "metadata": {
        "userAgent": "Mozilla/5.0...",
        "screenResolution": "1920x1080"
      }
    }
  ]
}
```

### Admin Dashboard

```http
GET /api/analytics/admin/scores
Authorization: Bearer <admin-token>
Query: ?riskLevel=high&minScore=50&page=1&limit=20

GET /api/analytics/admin/scores/:userId

GET /api/analytics/admin/clusters

GET /api/analytics/admin/collusion-rings

GET /api/analytics/admin/dashboard/stats
```

---

## Deployment Checklist

- [ ] Set up PostgreSQL with analytics schema
- [ ] Configure Redis for real-time processing
- [ ] Deploy analytics service
- [ ] Integrate client collector in web app
- [ ] Set up admin dashboard access
- [ ] Configure alerting for critical risk users
- [ ] Set up batch job monitoring
- [ ] Implement retention policy jobs
- [ ] Train moderation team on fraud review
- [ ] Document appeal process

---

## Future Improvements

1. **ML Enhancement**
   - Train classification model on labeled data
   - Embedding-based behavioral similarity
   - Anomaly detection with autoencoders

2. **Advanced Signals**
   - Biometric analysis (touch pressure)
   - Browser canvas fingerprinting
   - WebGL fingerprinting

3. **Real-Time Features**
   - CAPTCHA triggering mid-session
   - Dynamic rate limiting
   - Honeypot characters

4. **Analytics**
   - Fraud trend dashboards
   - Creator-specific fraud patterns
   - Cost estimation of prevented fraud
