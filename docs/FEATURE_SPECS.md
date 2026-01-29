# Feature Specifications
## Bostonia - AI Character Chat Platform

---

## Table of Contents
1. [Memory Nexus System](#1-memory-nexus-system)
2. [Character System](#2-character-system)
3. [Chat System](#3-chat-system)
4. [Lorebook System](#4-lorebook-system)
5. [Voice Features](#5-voice-features)
6. [Creator Tools](#6-creator-tools)
7. [Content Moderation](#7-content-moderation)
8. [Monetization Features](#8-monetization-features)

---

## 1. Memory Nexus System

### Overview
Memory Nexus is Bostonia's proprietary long-term memory system that ensures AI characters remember past interactions, relationships, and key story events.

### 1.1 Memory Types

#### Short-Term Memory
```
Purpose: Immediate conversation context
Storage: Redis (hot cache) + sliding window
Retention: Current session
Capacity: Last 20-50 messages
```

**Implementation:**
- Maintains last N messages in context window
- Automatically truncated when exceeding token limit
- Always included in LLM prompt

#### Long-Term Memory
```
Purpose: Persistent facts across sessions
Storage: PostgreSQL + Pinecone (vectors)
Retention: Indefinite (user can delete)
Capacity: Unlimited
```

**Memory Subtypes:**
| Type | Description | Example |
|------|-------------|---------|
| Fact | Objective information | "User's name is Alex" |
| Preference | User likes/dislikes | "User prefers morning meetings" |
| Relationship | Character-user dynamics | "User is character's mentor" |
| Event | Key story moments | "User saved character from dragon" |
| Emotion | Emotional context | "User was sad during last conversation" |

#### Episodic Memory
```
Purpose: Milestone events and turning points
Storage: PostgreSQL
Retention: Indefinite
Trigger: Manually marked or auto-detected
```

### 1.2 Memory Extraction Pipeline

```
User Message → AI Response → Async Extraction Queue
                                    ↓
                            Memory Extractor LLM
                                    ↓
                        ┌───────────┼───────────┐
                        ↓           ↓           ↓
                     Facts    Relationships   Events
                        ↓           ↓           ↓
                    Importance Scoring (0-1)
                        ↓           ↓           ↓
                    Embedding Generation
                        ↓           ↓           ↓
                    ┌───────────────────────────┐
                    │   PostgreSQL + Pinecone   │
                    └───────────────────────────┘
```

### 1.3 Memory Retrieval

**RAG (Retrieval Augmented Generation):**
1. Embed current user message
2. Query Pinecone for similar memories (top 10)
3. Filter by relevance score (>0.7)
4. Format and inject into context

**Context Assembly Order:**
```
1. System Prompt (character personality)
2. [MEMORIES] Relevant long-term memories
3. [STORY SO FAR] Conversation summary (if long)
4. [WORLD INFO] Lorebook entries (if active)
5. Recent messages (sliding window)
6. Current user message
```

### 1.4 Memory UI Features

| Feature | Description |
|---------|-------------|
| Memory Viewer | See what character "knows" about user |
| Memory Editor | Add, edit, or delete specific memories |
| Memory Timeline | Visual timeline of key events |
| Memory Search | Search through all stored memories |
| Memory Export | Download memories as JSON |

### 1.5 Memory API

```yaml
GET /api/v1/conversations/{id}/memories
Response:
  - memories: Memory[]
  - total_count: number
  - filters_applied: object

POST /api/v1/conversations/{id}/memories
Body:
  - content: string
  - memory_type: "fact" | "preference" | "relationship" | "event"
  - importance: number (0-1)

DELETE /api/v1/conversations/{id}/memories/{memoryId}

GET /api/v1/conversations/{id}/memories/summary
Response:
  - summary: string
  - key_facts: string[]
  - relationship_status: string
```

---

## 2. Character System

### 2.1 Character Data Model

```typescript
interface Character {
  // Identity
  id: string;
  name: string;
  tagline: string;  // Max 200 chars
  description: string;
  avatarUrl: string;

  // Personality Configuration
  personality: {
    traits: PersonalityTrait[];  // 5-10 traits
    writingStyle: WritingStyle;
    temperature: number;  // 0.5-1.2
    verbosity: "concise" | "moderate" | "verbose";
    vocabulary: "simple" | "standard" | "sophisticated";
    tone: string[];  // ["friendly", "sarcastic", "mysterious"]
  };

  // Background
  backstory: string;  // Max 5000 chars
  systemPrompt: string;  // Max 2000 chars
  greeting: string;  // First message
  exampleDialogue: DialogueExample[];

  // Metadata
  visibility: "private" | "unlisted" | "public";
  contentTier: "sfw" | "mature" | "adult";
  isPremium: boolean;
  premiumCredits: number;
  tags: string[];

  // Stats
  totalConversations: number;
  totalMessages: number;
  avgRating: number;
  ratingCount: number;

  // Creator
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonalityTrait {
  name: string;
  value: number;  // -100 to 100
  // Examples: introvert(-100) to extrovert(100)
}

interface WritingStyle {
  useEmoji: boolean;
  useAsteriskActions: boolean;  // *looks away*
  paragraphLength: "short" | "medium" | "long";
  punctuationStyle: "minimal" | "standard" | "expressive";
}
```

### 2.2 Character Creation Studio

**Step 1: Basic Info**
- Name (required)
- Tagline
- Avatar upload/generation
- Content tier selection

**Step 2: Personality Builder**
```
Trait Sliders:
├── Introvert ◀────────────▶ Extrovert
├── Serious ◀────────────▶ Playful
├── Logical ◀────────────▶ Emotional
├── Reserved ◀────────────▶ Open
├── Cautious ◀────────────▶ Adventurous
├── Practical ◀────────────▶ Imaginative
├── Independent ◀────────────▶ Cooperative
├── Traditional ◀────────────▶ Progressive
└── Calm ◀────────────▶ Intense
```

**Step 3: Writing Style**
- Response length preference
- Use of actions (*does something*)
- Emoji usage
- Vocabulary level
- Sample output preview

**Step 4: Background**
- Backstory editor (rich text)
- Key facts extraction helper
- Relationship to user (default)
- World/setting context

**Step 5: System Prompt**
- Advanced prompt editor
- Template library
- Variable support ({{user}}, {{char}})
- Character limit indicator

**Step 6: Example Dialogue**
- Add sample conversations
- User/Character pairs
- Helps establish voice

**Step 7: Testing Sandbox**
- Live chat with character
- Iterate before publishing
- Save test conversations

**Step 8: Publish Settings**
- Visibility selection
- Pricing (if premium)
- Tags selection
- Submit for review

### 2.3 Character Discovery

**Browse Sections:**
| Section | Algorithm |
|---------|-----------|
| Trending | Conversations/24h × rating |
| Popular | Total conversations × rating |
| New | Created in last 7 days |
| Rising | Growth rate in conversations |
| Featured | Curated by Bostonia team |
| For You | ML recommendation |

**Search & Filters:**
```
Search: Free text query
Filters:
  - Genre: Fantasy, Sci-Fi, Romance, Horror, etc.
  - Personality: Friendly, Mysterious, Romantic, etc.
  - Content Tier: SFW, Mature, Adult
  - Rating: 4+, 4.5+, etc.
  - Creator: Verified creators only
  - Price: Free, Premium
```

### 2.4 Character Rating & Reviews

**Rating System:**
- 5-star scale
- Optional written review
- Criteria badges: "Great Memory", "Creative", "Engaging"
- Helpful votes on reviews

**Review Guidelines:**
- No spoilers without tags
- Constructive feedback encouraged
- Report inappropriate reviews

---

## 3. Chat System

### 3.1 Real-Time Chat Interface

**UI Components:**
```
┌────────────────────────────────────────────────────────────────┐
│  [Avatar] Character Name                    [Settings] [Exit] │
│  Online • 2.3k conversations                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [Character Avatar]                                            │
│  Hello! I've been waiting for you...                          │
│                                               10:23 AM         │
│                                                                │
│                                    [User Avatar]               │
│                     Hi! Tell me about yourself.               │
│                                               10:24 AM         │
│                                                                │
│  [Character Avatar]                                            │
│  *leans forward with a mysterious smile*                      │
│  Well, where do I begin? I've lived a                         │
│  thousand lives across countless worlds...                    │
│                                               10:24 AM         │
│                                                                │
│         [Regenerate] [Branch] [Edit]                          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  [Memory] [Lorebook]    Type a message...    [Send]           │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Message Features

| Feature | Description |
|---------|-------------|
| **Streaming** | Responses appear character by character |
| **Regenerate** | Generate alternative response |
| **Edit** | Edit user's previous message, regenerate |
| **Branch** | Create alternate timeline from any point |
| **Copy** | Copy message text |
| **Delete** | Remove message from history |
| **Pin** | Pin important messages |

### 3.3 Conversation Branching

```
Original Timeline:
Message 1 → Message 2 → Message 3 → Message 4
                           ↓
                        Branch A: Message 3a → Message 4a
                           ↓
                        Branch B: Message 3b → Message 4b

UI: Timeline selector shows branches
```

### 3.4 Multi-Character Chat (Phase 2)

**Modes:**
1. **Group Chat** - User + multiple characters interact
2. **Spectator** - Watch characters interact, user observes
3. **Director** - User narrates, characters respond

**Turn Management:**
- Round-robin
- Free-flow (AI decides who responds)
- User-directed (user picks next speaker)

### 3.5 Chat Settings

```yaml
Settings per conversation:
  - AI Model selection
  - Response length preference
  - Memory visibility toggle
  - Lorebook activation
  - Auto-save frequency

Settings per user:
  - Default model
  - Typing indicators
  - Sound effects
  - Notification preferences
  - Content filter level
```

### 3.6 Export & Backup

**Export Formats:**
- TXT (plain text)
- PDF (formatted)
- JSON (full data)
- Markdown

**Export Options:**
- Include memories
- Include character info
- Anonymize user name
- Date range selection

---

## 4. Lorebook System

### 4.1 Overview
Lorebooks are world-building databases that inject relevant information into conversations automatically.

### 4.2 Lorebook Structure

```typescript
interface Lorebook {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  visibility: "private" | "unlisted" | "public";
  entries: LorebookEntry[];
}

interface LorebookEntry {
  id: string;
  entryType: "character" | "location" | "item" | "faction" | "event" | "concept";
  name: string;
  content: string;  // The actual lore
  keywords: string[];  // Trigger words
  priority: number;  // Higher = more likely to include
  enabled: boolean;
}
```

### 4.3 Entry Types

| Type | Use Case | Example |
|------|----------|---------|
| Character | NPCs, side characters | "Elena: The queen's advisor, secretly a spy" |
| Location | Places in the world | "The Crystal Caverns: Ancient caves full of magic crystals" |
| Item | Objects, artifacts | "The Blade of Dawn: Legendary sword that glows at sunrise" |
| Faction | Groups, organizations | "The Shadow Guild: Underground network of thieves" |
| Event | Historical events | "The Great War: 100 years ago, dragons attacked" |
| Concept | Rules, magic systems | "Spellcasting requires verbal components" |

### 4.4 Keyword Matching

**How it works:**
1. User sends message
2. System scans for keywords in active lorebook
3. Matching entries retrieved
4. Top N entries (by priority) injected into context
5. AI references lore naturally in response

**Example:**
```
Keywords: ["crystal", "cave", "cavern", "gems"]
User message: "Let's explore the crystal caves"
→ Entry "The Crystal Caverns" gets injected

AI Response: "The Crystal Caverns? I've heard tales of their
beauty... and danger. The magic crystals are said to
sing at midnight, but many who sought them never returned."
```

### 4.5 Lorebook Editor UI

```
┌──────────────────────────────────────────────────────────────┐
│  Lorebook: "Kingdom of Eldoria"                   [Save]    │
├──────────────────────────────────────────────────────────────┤
│  [+ Add Entry]     Search entries...                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📍 Locations (12)                                          │
│    ├── The Capital City                              [Edit] │
│    ├── The Crystal Caverns                           [Edit] │
│    └── The Dark Forest                               [Edit] │
│                                                              │
│  👤 Characters (8)                                          │
│    ├── Queen Aleria                                  [Edit] │
│    ├── Advisor Elena                                 [Edit] │
│    └── Captain Marcus                                [Edit] │
│                                                              │
│  ⚔️ Items (5)                                               │
│    ├── The Blade of Dawn                             [Edit] │
│    └── The Shadow Amulet                             [Edit] │
│                                                              │
│  🏰 Factions (4)                                            │
│    └── The Shadow Guild                              [Edit] │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.6 Sharing & Templates

- Public lorebooks can be shared/forked
- Template lorebooks for common genres (Fantasy, Sci-Fi, etc.)
- Import/export as JSON
- Collaborative editing (future)

---

## 5. Voice Features

### 5.1 Text-to-Speech (TTS)

**Capabilities:**
- Real-time voice synthesis of AI responses
- Multiple voice options per character
- Emotion detection for expressive speech
- Speed and pitch controls

**Voice Providers:**
- Primary: ElevenLabs (quality)
- Backup: PlayHT / Azure TTS

**Voice Library:**
```
Categories:
├── Male Voices (20+)
│   ├── Young/Teen
│   ├── Adult
│   ├── Elderly
│   └── Fantasy/Fictional
├── Female Voices (20+)
│   └── [Same subcategories]
├── Non-binary Voices (10+)
└── Custom (upload samples - future)
```

### 5.2 Voice Call Mode

**Flow:**
1. User initiates voice call
2. Voice connection established (WebRTC)
3. User speaks → Speech-to-text
4. AI processes → Text response
5. TTS synthesizes response
6. Audio plays to user
7. Repeat

**UI:**
```
┌─────────────────────────────────────────┐
│                                         │
│           [Character Avatar]            │
│              🎤 Speaking...             │
│                                         │
│        ┌─────────────────────┐         │
│        │   Waveform Visual   │         │
│        └─────────────────────┘         │
│                                         │
│     [Mute]  [End Call]  [Settings]     │
│                                         │
│   Call Duration: 5:23                   │
│                                         │
└─────────────────────────────────────────┘
```

### 5.3 Voice Customization

**Per-Character Settings:**
- Default voice selection
- Speaking speed (0.5x - 2x)
- Pitch adjustment
- Emotion intensity

**Creator Tools:**
- Preview voices before assigning
- Voice A/B testing
- Custom voice cloning (enterprise)

### 5.4 Pricing

| Feature | Free | Plus | Pro |
|---------|------|------|-----|
| TTS Characters/day | 0 | 5,000 | 25,000 |
| Voice Call Minutes/day | 0 | 10 | 60 |
| Voice Options | 5 | 20 | All |
| Custom Voices | No | No | Yes |

---

## 6. Creator Tools

### 6.1 Creator Dashboard

```
┌──────────────────────────────────────────────────────────────────┐
│  CREATOR DASHBOARD                    Verified Creator Badge ✓   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Overview                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  $1,234  │  │  45.2K   │  │  892     │  │  4.7★    │        │
│  │ Earnings │  │  Chats   │  │ Follows  │  │ Avg Rtng │        │
│  │  this mo │  │  this mo │  │  total   │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   Revenue Chart (30 days)                   ││
│  │  $100 ┤                                    ╭────            ││
│  │       │                               ╭───╯                 ││
│  │   $50 ┤              ╭───╮      ╭────╯                      ││
│  │       │         ╭───╯   ╰─────╯                             ││
│  │    $0 ┤────────╯                                            ││
│  │       └─────┬─────┬─────┬─────┬─────┬─────┬─────           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  My Characters                                      [+ Create]   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ [Img] Luna the Witch      4.8★  12.3K chats   $456 earned │ │
│  │ [Img] Detective Marcus    4.6★   8.1K chats   $312 earned │ │
│  │ [Img] Princess Elena      4.9★  15.6K chats   $523 earned │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Analytics

**Metrics Available:**
| Metric | Description |
|--------|-------------|
| Conversations Started | Total new conversations |
| Messages Exchanged | Total messages with character |
| Avg. Session Length | Average conversation duration |
| Return Rate | % of users who return |
| Rating Distribution | 1-5 star breakdown |
| Revenue by Source | Subscriptions, tips, premium unlocks |
| Geographic Distribution | Where users are from |
| Peak Hours | When character is most active |

### 6.3 A/B Testing

**Testable Elements:**
- Character greeting
- Personality settings
- Avatar image
- Description text
- System prompt variations

**Test Setup:**
```
Test Name: "Greeting Variation Test"
Duration: 7 days
Split: 50/50

Variant A: "Hello there! *waves enthusiastically*"
Variant B: "Greetings, traveler. What brings you here?"

Track: Session length, return rate, rating
```

### 6.4 Revenue Share Model

**Standard Split:**
```
Creator: 70%
Platform: 30%

Example:
- User pays $9.99/month (Plus)
- User spends 40% of time with your character
- Your share: $9.99 × 0.40 × 0.70 = $2.80
```

**Premium Character Unlocks:**
```
Creator sets price: 50 credits ($0.50)
Creator receives: 35 credits ($0.35)
Platform keeps: 15 credits ($0.15)
```

**Tips:**
```
User tips: 100 credits ($1.00)
Creator receives: 85 credits ($0.85)
Platform keeps: 15 credits ($0.15)
```

### 6.5 Payout System

**Requirements:**
- Verified creator status
- Stripe Connect account
- Minimum $25 balance
- ID verification completed

**Payout Schedule:**
- Weekly (Tuesday)
- Manual request available
- Direct deposit to bank

---

## 7. Content Moderation

### 7.1 Content Tiers

| Tier | Code | Description | Age Requirement |
|------|------|-------------|-----------------|
| Safe for Work | SFW | No mature themes | None |
| Mature | MATURE | Violence, mild themes | 16+ |
| Adult | ADULT | Explicit content | 18+ verified |

### 7.2 Age Verification

**Methods:**
1. **Self-Declaration** - User confirms age (for Mature)
2. **ID Verification** - Government ID check (for Adult)
3. **Credit Card** - Payment method implies 18+

**Flow for Adult Content:**
```
1. User attempts to access Adult content
2. Prompt: "This content requires age verification"
3. Options: [Verify with ID] [Use Credit Card]
4. If ID: Upload photo → AI verification → Manual review
5. If Card: Make small purchase → Refunded
6. Verification stored (one-time)
```

### 7.3 Automated Moderation

**Input Filtering:**
- Detect and block illegal content requests
- Flag suspicious patterns
- Rate-limit problematic users

**Output Filtering:**
- AI responses scanned before display
- Content tier enforcement
- Personal information detection

**Classification Pipeline:**
```
Message → Content Classifier → Risk Score (0-1)
           ↓
    ┌──────┼──────┐
    ↓      ↓      ↓
  Pass   Review   Block
 (<0.3)  (0.3-0.7) (>0.7)
```

### 7.4 User Reporting

**Report Types:**
- Harassment/Abuse
- Illegal Content
- Copyright Violation
- Impersonation
- Spam/Scam

**Report Flow:**
1. User clicks "Report" on message/character
2. Select reason + optional details
3. Report queued for review
4. Moderator reviews within 24h
5. Action taken + user notified

### 7.5 Creator Guidelines

**Prohibited:**
- Content depicting minors in sexual situations
- Non-consensual content without clear fantasy context
- Real person impersonation without disclaimer
- Hate speech or discrimination
- Illegal activity promotion

**Allowed with Proper Tagging:**
- Violence in fictional contexts
- Mature romantic content (age-verified)
- Dark/horror themes
- Controversial topics for exploration

---

## 8. Monetization Features

### 8.1 Subscription Tiers

| Feature | Free | Plus ($9.99) | Pro ($19.99) | Creator ($29.99) |
|---------|------|--------------|--------------|------------------|
| Messages/day | 100 | Unlimited | Unlimited | Unlimited |
| Ads | Yes | No | No | No |
| Queue Priority | Low | Medium | High | Highest |
| AI Models | Basic | Standard | Premium | All |
| Voice TTS | No | 5K chars/day | 25K chars/day | Unlimited |
| Voice Calls | No | 10 min/day | 60 min/day | Unlimited |
| Multi-Character | No | 2 chars | 5 chars | Unlimited |
| Memory Editing | No | Yes | Yes | Yes |
| Lorebooks | 1 | 5 | Unlimited | Unlimited |
| Character Slots | 3 | 10 | 50 | Unlimited |
| Analytics | No | Basic | Advanced | Full |
| Revenue Share | No | No | No | Yes (70%) |
| Verified Badge | No | No | No | Yes |

### 8.2 Credit System

**Earning Credits:**
- Daily login: 10 credits
- Watching ads: 5 credits/ad
- Referrals: 100 credits/signup
- Creator earnings

**Spending Credits:**
| Action | Cost |
|--------|------|
| Premium character unlock | 20-100 credits |
| Image generation | 5 credits |
| Voice synthesis (1K chars) | 2 credits |
| Model upgrade (per message) | 1 credit |
| Tip creator | Variable |

**Credit Packages:**
| Package | Credits | Price | Bonus |
|---------|---------|-------|-------|
| Starter | 500 | $4.99 | - |
| Standard | 1,500 | $12.99 | +150 |
| Premium | 5,000 | $39.99 | +750 |
| Ultimate | 15,000 | $99.99 | +3,000 |

### 8.3 Premium Characters

**Creator Options:**
- Set unlock price (20-500 credits)
- First N messages free (teaser)
- Subscription-only access
- Tip jar enabled/disabled

**User Experience:**
```
[Locked Character Card]
"Luna the Mystic Witch"
⭐ 4.9 (2,341 reviews) | 45K conversations

🔒 Premium Character - 50 credits to unlock
"Unlock to chat with Luna and discover her magical secrets..."

[Preview Chat] [Unlock Now]
```

### 8.4 Advertising (Free Tier)

**Ad Placements:**
- Banner between messages (every 20 messages)
- Interstitial on conversation start (skippable)
- Rewarded video for bonus credits

**Ad Guidelines:**
- No explicit/adult ads
- Frequency capped per session
- Category exclusions available

---

## Appendix: API Reference Summary

### Authentication
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

### Users
```
GET /api/v1/users/me
PATCH /api/v1/users/me
GET /api/v1/users/me/preferences
GET /api/v1/users/me/favorites
```

### Characters
```
GET /api/v1/characters
GET /api/v1/characters/{id}
POST /api/v1/characters
PATCH /api/v1/characters/{id}
DELETE /api/v1/characters/{id}
GET /api/v1/characters/trending
GET /api/v1/characters/search
```

### Conversations
```
GET /api/v1/conversations
POST /api/v1/conversations
GET /api/v1/conversations/{id}
DELETE /api/v1/conversations/{id}
GET /api/v1/conversations/{id}/messages
POST /api/v1/conversations/{id}/messages
```

### Memory
```
GET /api/v1/conversations/{id}/memories
POST /api/v1/conversations/{id}/memories
DELETE /api/v1/conversations/{id}/memories/{memoryId}
GET /api/v1/conversations/{id}/summary
```

### Lorebooks
```
GET /api/v1/lorebooks
POST /api/v1/lorebooks
GET /api/v1/lorebooks/{id}
PATCH /api/v1/lorebooks/{id}
DELETE /api/v1/lorebooks/{id}
POST /api/v1/lorebooks/{id}/entries
```

### Payments
```
POST /api/v1/payments/subscribe
POST /api/v1/payments/cancel
POST /api/v1/payments/credits
GET /api/v1/payments/history
```

### Creator
```
GET /api/v1/creator/profile
PATCH /api/v1/creator/profile
GET /api/v1/creator/analytics
GET /api/v1/creator/earnings
POST /api/v1/creator/payout
```

---

*Document Version: 1.0*
*Last Updated: January 28, 2026*
