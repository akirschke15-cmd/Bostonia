# Bostonia Economic Fraud Deterrence Framework

## Executive Summary

This document outlines economic mechanisms to prevent creator fraud on Bostonia, an AI character chat platform where creators earn revenue share. The framework ensures fraud is economically unprofitable while maintaining a positive experience for legitimate creators.

**Core Principle**: Make the cost of fraud exceed the potential reward, while keeping barriers low enough that honest creators can thrive.

---

## 1. Revenue Attribution Models

### Current State Analysis

Based on the existing codebase (`creator.service.ts`), the platform currently tracks:
- Subscription share (70% to creators)
- Premium unlocks
- Tips
- Monthly interactions and unique users

### Recommended Multi-Factor Revenue Model

Instead of simple per-message payments, implement a **Quality-Weighted Revenue Attribution** system:

#### 1.1 Engagement Quality Score (EQS)

```
EQS = (ConversationDepth * 0.3) + (RetentionScore * 0.35) + (UniqueUserMultiplier * 0.25) + (ContentQuality * 0.1)
```

| Component | Calculation | Fraud Resistance |
|-----------|-------------|------------------|
| **Conversation Depth** | Messages per session / 50 (capped at 1.0) | Requires sustained engagement |
| **Retention Score** | % of users who return within 7 days | Cannot be faked short-term |
| **Unique User Multiplier** | Unique users / Total conversations | Penalizes self-farming |
| **Content Quality** | Avg response length + sentiment diversity | Bots produce repetitive content |

#### 1.2 Tiered Revenue Rates

| Tier | EQS Range | Revenue Share | Rationale |
|------|-----------|---------------|-----------|
| Bronze | 0.0 - 0.3 | 50% | Low quality/suspicious patterns |
| Silver | 0.3 - 0.6 | 65% | Average engagement |
| Gold | 0.6 - 0.8 | 70% | Good engagement (current rate) |
| Platinum | 0.8 - 1.0 | 75% | Exceptional creators |

#### 1.3 Conversation Value Weights

Not all conversations are equal. Apply these multipliers:

| Conversation Type | Multiplier | Reason |
|-------------------|------------|--------|
| First-time user to character | 1.5x | Acquisition is valuable |
| Returning user (7+ days) | 1.3x | Retention signal |
| Deep conversation (20+ messages) | 1.2x | Genuine engagement |
| Super short (<5 messages) | 0.3x | Low value/suspicious |
| Same-IP multiple accounts | 0.0x | Obvious fraud |

#### 1.4 Retention-Based Bonus Pool

Allocate 10% of platform revenue to a monthly bonus pool distributed based on:

```
Creator Bonus Share = (Creator's Retained Users / Platform Total Retained Users) * Bonus Pool
```

**Retained User Definition**: User who:
- Started conversation with creator's character
- Returned at least 3 times in 30 days
- Spent >10 minutes total on platform
- Has verified email or social login

---

## 2. Payment Controls

### 2.1 Payout Delay Structure

| Creator Trust Level | Payout Delay | Rationale |
|---------------------|--------------|-----------|
| New (0-30 days) | 45 days | Maximum fraud detection window |
| Established (31-90 days) | 30 days | Reduced risk |
| Trusted (91-180 days) | 14 days | Proven track record |
| Verified (180+ days) | 7 days | Minimal risk |

**Current Implementation**: 5 business days (too short for fraud detection)

**Recommendation**: Implement graduated delays with clear communication to creators about how to reduce their delay period.

### 2.2 Minimum Payout Thresholds

| Trust Level | Minimum Payout | Current |
|-------------|----------------|---------|
| New | $100 | $50 |
| Established | $75 | $50 |
| Trusted | $50 | $50 |
| Verified | $25 | $50 |

**Rationale**: Higher threshold for new creators means fraudsters need more "investment" before seeing any return. Lower thresholds reward established creators.

### 2.3 Graduated Withdrawal Limits

| Trust Level | Weekly Limit | Monthly Limit |
|-------------|--------------|---------------|
| New | $500 | $1,000 |
| Established | $2,500 | $5,000 |
| Trusted | $10,000 | $25,000 |
| Verified | $50,000 | Unlimited |

### 2.4 Escrow and Clawback Mechanisms

#### Rolling Escrow System

```
Total Earnings = Paid Out + In Escrow + Pending Review

Escrow Rules:
- 20% of earnings held in rolling 90-day escrow
- Released automatically if no fraud detected
- Forfeited entirely if fraud confirmed
```

#### Clawback Triggers

| Trigger | Action | Appeal Window |
|---------|--------|---------------|
| Bot traffic detected (>50% automated) | 100% clawback of affected period | 14 days |
| Self-dealing (same payment source) | 100% clawback + account review | 7 days |
| Coordinated fake reviews | 50% clawback + demotion | 14 days |
| Terms of Service violation | Case-by-case | 30 days |

---

## 3. Stake-Based Deterrents

### 3.1 Creator Deposit / Bond System

**Optional Verification Bond**: Creators can optionally stake funds to unlock benefits:

| Bond Amount | Benefits |
|-------------|----------|
| $0 (no bond) | Standard 45-day payout delay, standard revenue share |
| $100 | 30-day payout delay, priority support |
| $500 | 14-day payout delay, featured placement eligibility |
| $2,000 | 7-day payout delay, premium analytics, direct partnership |

**Bond Rules**:
- Refundable after 1 year of good standing
- Forfeited on confirmed fraud
- Earns 2% annual interest while held
- Can be withdrawn with 90-day notice

### 3.2 Reputation Staking

Creators accumulate "Reputation Points" (RP) that function as stake:

```
RP Earned:
- Per legitimate conversation completed: +1 RP
- Per returning user: +5 RP
- Per month without issues: +50 RP
- Per positive user report: +10 RP
- Featured by platform: +100 RP

RP Lost:
- Per suspicious activity flag: -25 RP
- Per user complaint: -10 RP
- Failed content moderation: -50 RP
- Fraud warning: -200 RP
- Confirmed fraud: -ALL RP
```

**RP Benefits**:

| RP Level | Status | Benefits |
|----------|--------|----------|
| 0-100 | Newcomer | Basic features only |
| 100-500 | Rising | Reduced payout delay (30 days) |
| 500-2,000 | Established | 14-day payout, higher limits |
| 2,000-10,000 | Star | 7-day payout, featured eligible |
| 10,000+ | Legend | Same-day payout, partnership opportunities |

### 3.3 Penalty Structures

| Offense Level | First Offense | Second Offense | Third Offense |
|---------------|---------------|----------------|---------------|
| Minor (suspicious patterns) | Warning + 90-day monitoring | 30-day earnings freeze | 6-month suspension |
| Moderate (attempted manipulation) | 30-day earnings freeze + RP reset | 6-month suspension | Permanent ban |
| Severe (confirmed fraud) | Permanent ban + clawback | N/A | N/A |

**Financial Penalties**:
- All pending payouts frozen during investigation
- Confirmed fraud results in 100% clawback of previous 180 days
- Legal action reserved for fraud exceeding $10,000

---

## 4. Incentive Alignment

### 4.1 Metrics That Are Hard to Fake

| Metric | Why It's Hard to Fake | Weight in Revenue |
|--------|----------------------|-------------------|
| **7-Day User Retention** | Requires sustained fake accounts over time | 25% |
| **Conversation Duration (time-based)** | Bots can't replicate natural typing patterns | 20% |
| **User Diversity Score** | Unique IPs, devices, payment methods | 20% |
| **Cross-Character Engagement** | Fake accounts typically single-character | 15% |
| **Organic Discovery Rate** | % users finding character without direct link | 10% |
| **Message Quality Variance** | Real conversations have natural variation | 10% |

### 4.2 Long-Term vs Short-Term Incentive Balance

#### Short-Term Incentives (Monthly)
- Base revenue share on messages
- Bonus for new user acquisition
- Tips from users

#### Long-Term Incentives (Quarterly/Annual)
- **Loyalty Bonus**: +5% revenue share after 6 months, +10% after 1 year
- **Retention Bonus Pool**: Quarterly distribution based on user retention
- **Partnership Revenue**: Revenue share on merchandise, licensing (top creators)
- **Equity Pool**: Top 100 creators share 1% of company equity annually

#### Incentive Vesting Schedule

```
Month 1-3:   60% immediate, 40% vested over 90 days
Month 4-6:   70% immediate, 30% vested over 60 days
Month 7-12:  80% immediate, 20% vested over 30 days
Year 2+:     90% immediate, 10% vested over 14 days
```

**Rationale**: Fraudsters want quick cash-out. Vesting period ensures they must maintain good standing to collect full earnings.

### 4.3 Community-Based Validation

#### User Quality Signals
- Users can report suspicious characters
- "Verified Engagement" badge for characters with high legitimate engagement
- Community voting on featured characters (Sybil-resistant via credit cost)

#### Creator Peer Review
- Established creators can flag suspicious new creators
- Peer-reviewed creators get faster approval for new characters
- Creator council advises on policy changes

---

## 5. Fraud Economics Analysis

### 5.1 Cost to Fake 1,000 Conversations

| Cost Component | Low Estimate | High Estimate |
|----------------|--------------|---------------|
| **Account Creation** | | |
| - Email accounts (if verified required) | $50 (bulk emails) | $500 (real emails) |
| - Phone verification (if required) | $200 | $1,000 |
| - IP rotation/proxies | $20/month | $200/month |
| **Engagement Simulation** | | |
| - Bot development/subscription | $100 | $500 |
| - Human click farm (if CAPTCHA) | $50 | $300 |
| - Time investment (manual) | $0 | $500 (opportunity cost) |
| **Payment Method** | | |
| - Prepaid cards for fake "tips" | $100 | $500 |
| | | |
| **TOTAL COST** | **$520** | **$3,500** |

### 5.2 Potential Fraud Revenue (Without Deterrents)

Assuming:
- 1,000 fake conversations
- 20 messages per conversation
- $0.01 per message to creator
- 70% revenue share

```
Gross Revenue = 1,000 * 20 * $0.01 = $200
Creator Share = $200 * 0.70 = $140
```

**Without deterrents**: Fraud is unprofitable at basic message rates.

**But with gaming**:
- Premium unlocks: $5 each * 100 = $500
- Fake tips: $100 (with own money, laundering)
- Bonus pool manipulation: $200
- **Total potential**: ~$800

### 5.3 Break-Even Analysis

#### Scenario A: Low-Security Platform
- Cost to fraud: $520
- Potential revenue: $800
- **Profit: $280** (fraud is profitable)

#### Scenario B: With This Framework
- Cost to fraud: $520 + $100 bond + $500 delayed (45 days) + 20% escrow
- Potential revenue: $800 * 0.5 (EQS penalty) = $400
- Detection probability: 80%
- Expected value: $400 * 0.2 - $620 = **-$540** (fraud is unprofitable)

### 5.4 Making Fraud Unprofitable: Key Thresholds

| Defense Layer | Fraud Cost Increase | Revenue Reduction |
|---------------|---------------------|-------------------|
| Phone verification | +$200 per 1K accounts | - |
| 45-day payout delay | +$X opportunity cost | - |
| EQS-based revenue | - | -50% for fake traffic |
| Unique user requirement | +$1,000 (real accounts) | - |
| 20% escrow | - | -20% effective |
| Detection + clawback | - | -80% expected value |

**Combined Effect**: Fraud costs $2,000+ to potentially earn $80 (after expected clawback).

---

## 6. Legitimate Creator Experience

### 6.1 Ensuring Anti-Fraud Measures Don't Hurt Honest Creators

#### Grandfathering
- Existing creators with good history automatically receive "Established" status
- No retroactive application of stricter rules

#### Gradual Verification
- Start with minimal requirements
- Only add verification steps when suspicious patterns detected
- Never require ID verification unless legally necessary

#### Clear Communication
- Dashboard shows exactly why earnings are at current tier
- Estimated payout date always visible
- Real-time alerts for any flags or issues

### 6.2 Revenue Calculation Transparency

#### Creator Dashboard Displays:

```
Current Period Earnings:
├── Base Messages: 15,420 messages × $0.008 = $123.36
├── Quality Multiplier: EQS 0.72 = 1.05x → $129.53
├── New User Bonus: 45 new users × $0.50 = $22.50
├── Retention Bonus: 120 retained × $0.25 = $30.00
├── Tips: $45.00
├── Premium Unlocks: 8 × $3.50 = $28.00
├── SUBTOTAL: $255.03
├── Platform Fee (30%): -$76.51
├── In Escrow (20%): -$35.70
└── AVAILABLE: $142.82

Trust Level: Established (Silver)
Payout Delay: 30 days
Next Payout: Feb 28, 2026
Escrow Release: $89.40 on Mar 15, 2026
```

### 6.3 Clear Appeals Process

#### Automated Flag Resolution (80% of cases)

1. Creator receives notification: "Unusual pattern detected"
2. System explains specific concern
3. Creator can provide context via form
4. AI + rules engine evaluates response
5. Resolution within 48 hours

#### Human Review (20% of cases)

1. Escalated if automated resolution fails
2. Assigned to Trust & Safety team
3. Creator can submit documentation
4. Video call option for complex cases
5. Resolution within 7 business days

#### Formal Appeal

1. If creator disagrees with decision
2. Independent review panel (3 members)
3. Creator can present case
4. Final decision within 14 days
5. Decision is binding

---

## 7. Tiered Trust System

### 7.1 Trust Levels Overview

| Level | Name | Requirements | Population Target |
|-------|------|--------------|-------------------|
| 0 | New | Account created | 100% start here |
| 1 | Rising | 30 days + 500 RP + $50 earned | ~60% of active creators |
| 2 | Established | 90 days + 2,000 RP + $500 earned | ~30% of active creators |
| 3 | Trusted | 180 days + 5,000 RP + $2,000 earned | ~8% of active creators |
| 4 | Verified | 365 days + 10,000 RP + $10,000 earned + manual review | ~2% of active creators |

### 7.2 How Creators Level Up

#### Automatic Promotion Criteria

| From → To | Time | Reputation | Earnings | Other |
|-----------|------|------------|----------|-------|
| 0 → 1 | 30 days | 500 RP | $50 | Email verified |
| 1 → 2 | 90 days | 2,000 RP | $500 | No warnings in 60 days |
| 2 → 3 | 180 days | 5,000 RP | $2,000 | Retention rate >40% |
| 3 → 4 | 365 days | 10,000 RP | $10,000 | Manual verification |

#### Accelerated Promotion

Creators can request early promotion review if they:
- Exceed earnings threshold by 2x
- Have exceptional retention (>60%)
- Receive positive peer endorsements (3+)
- Post optional verification bond

### 7.3 Benefits at Each Trust Level

| Benefit | New | Rising | Established | Trusted | Verified |
|---------|-----|--------|-------------|---------|----------|
| Revenue Share | 60% | 65% | 70% | 72% | 75% |
| Payout Delay | 45 days | 30 days | 14 days | 7 days | 3 days |
| Min Payout | $100 | $75 | $50 | $25 | $10 |
| Weekly Limit | $500 | $2,500 | $10,000 | $50,000 | None |
| Escrow % | 25% | 20% | 15% | 10% | 5% |
| Featured Eligible | No | No | Yes | Yes | Priority |
| Analytics | Basic | Standard | Advanced | Premium | Full |
| Support | Community | Email | Priority | Dedicated | Account Manager |
| API Access | No | Read | Read/Write | Full | Full + Beta |

### 7.4 Automatic Demotion Triggers

| Trigger | Demotion | Duration |
|---------|----------|----------|
| EQS drops below tier threshold for 30 days | -1 level | Until threshold met |
| Single fraud warning | -2 levels | 180 days minimum |
| 3+ user complaints in 30 days | -1 level | 90 days minimum |
| Failed content moderation (severe) | -1 level | 60 days minimum |
| Inactivity (90 days no content) | -1 level | Immediate on return |
| Confirmed fraud attempt | Level 0 + frozen | Permanent review |

#### Demotion Recovery Path

1. Creator notified immediately with specific reason
2. 30-day period to address issues
3. If issues resolved, no demotion
4. If demoted, clear criteria to regain status
5. Demotion history visible to creator (not public)

---

## 8. Implementation Recommendations

### Phase 1 (Months 1-2): Foundation
- [ ] Implement EQS calculation in `creator.service.ts`
- [ ] Add trust level field to User model
- [ ] Create earnings breakdown dashboard
- [ ] Implement graduated payout delays

### Phase 2 (Months 3-4): Detection
- [ ] Deploy anomaly detection for conversation patterns
- [ ] Implement IP/device fingerprinting
- [ ] Add user retention tracking
- [ ] Build fraud scoring model

### Phase 3 (Months 5-6): Incentive Alignment
- [ ] Launch retention bonus pool
- [ ] Implement reputation point system
- [ ] Add community reporting tools
- [ ] Create creator peer review program

### Phase 4 (Ongoing): Optimization
- [ ] A/B test threshold values
- [ ] Monthly fraud economics review
- [ ] Quarterly trust level distribution analysis
- [ ] Annual framework audit

---

## 9. Appendix: Database Schema Additions

```prisma
// Add to schema.prisma

model CreatorProfile {
  id                String   @id @default(uuid())
  userId            String   @unique
  trustLevel        Int      @default(0)  // 0-4
  reputationPoints  Int      @default(0)
  bondAmount        Int      @default(0)  // cents
  bondDepositedAt   DateTime?
  escrowBalance     Int      @default(0)  // cents
  totalEarned       Int      @default(0)  // cents, lifetime
  totalPaidOut      Int      @default(0)  // cents, lifetime
  eqsScore          Float    @default(0)  // 0.0 - 1.0
  eqsCalculatedAt   DateTime?
  lastPayoutAt      DateTime?
  demotionCount     Int      @default(0)
  warningCount      Int      @default(0)
  lastWarningAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  earnings          CreatorEarning[]
  payouts           CreatorPayout[]
  trustEvents       TrustEvent[]

  @@index([trustLevel])
  @@index([eqsScore])
}

model CreatorEarning {
  id                String   @id @default(uuid())
  creatorId         String
  characterId       String
  type              EarningType
  grossAmount       Int      // cents
  platformFee       Int      // cents
  escrowAmount      Int      // cents
  netAmount         Int      // cents
  qualityMultiplier Float    @default(1.0)
  userId            String?  // User who generated this earning
  conversationId    String?
  status            EarningStatus @default(PENDING)
  releaseDate       DateTime // When this earning becomes available
  releasedAt        DateTime?
  clawedBackAt      DateTime?
  clawbackReason    String?
  createdAt         DateTime @default(now())

  creator           CreatorProfile @relation(fields: [creatorId], references: [id])

  @@index([creatorId, status])
  @@index([releaseDate])
}

enum EarningType {
  MESSAGE_REVENUE
  NEW_USER_BONUS
  RETENTION_BONUS
  TIP
  PREMIUM_UNLOCK
  BONUS_POOL
}

enum EarningStatus {
  PENDING
  AVAILABLE
  PAID
  CLAWED_BACK
  FORFEITED
}

model CreatorPayout {
  id                String   @id @default(uuid())
  creatorId         String
  amount            Int      // cents
  status            PayoutStatus @default(PENDING)
  stripeTransferId  String?
  requestedAt       DateTime @default(now())
  processedAt       DateTime?
  completedAt       DateTime?
  failedAt          DateTime?
  failureReason     String?

  creator           CreatorProfile @relation(fields: [creatorId], references: [id])

  @@index([creatorId, status])
}

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

model TrustEvent {
  id                String   @id @default(uuid())
  creatorId         String
  eventType         TrustEventType
  previousLevel     Int?
  newLevel          Int?
  previousRP        Int?
  newRP             Int?
  reason            String
  metadata          Json?
  createdAt         DateTime @default(now())

  creator           CreatorProfile @relation(fields: [creatorId], references: [id])

  @@index([creatorId, createdAt])
  @@index([eventType])
}

enum TrustEventType {
  LEVEL_UP
  LEVEL_DOWN
  RP_GAINED
  RP_LOST
  WARNING_ISSUED
  WARNING_CLEARED
  BOND_DEPOSITED
  BOND_RELEASED
  BOND_FORFEITED
  FRAUD_DETECTED
  APPEAL_SUBMITTED
  APPEAL_RESOLVED
}

model FraudSignal {
  id                String   @id @default(uuid())
  creatorId         String?
  userId            String?
  signalType        FraudSignalType
  severity          Float    // 0.0 - 1.0
  details           Json
  ipAddress         String?
  deviceFingerprint String?
  resolved          Boolean  @default(false)
  resolvedAt        DateTime?
  resolvedBy        String?
  resolution        String?
  createdAt         DateTime @default(now())

  @@index([creatorId])
  @@index([userId])
  @@index([signalType])
  @@index([severity])
  @@index([createdAt])
}

enum FraudSignalType {
  RAPID_CONVERSATION_CREATION
  SAME_IP_MULTIPLE_ACCOUNTS
  BOT_LIKE_BEHAVIOR
  UNUSUAL_ENGAGEMENT_PATTERN
  SELF_DEALING_SUSPECTED
  COORDINATED_ACTIVITY
  SUSPICIOUS_PAYMENT_PATTERN
  FAKE_REVIEW_SUSPECTED
}
```

---

## 10. Key Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Fraud Detection Rate | >90% | <80% |
| False Positive Rate | <5% | >10% |
| Creator Satisfaction (NPS) | >50 | <30 |
| Average Time to Payout | <14 days (est.) | >30 days |
| Trust Level Distribution | Pyramid shape | Inverted |
| Appeal Success Rate | 20-30% | >50% or <10% |
| Clawback Amount / Total Payouts | <2% | >5% |

---

*Document Version: 1.0*
*Last Updated: January 29, 2026*
*Author: Bostonia Product & Economics Team*
