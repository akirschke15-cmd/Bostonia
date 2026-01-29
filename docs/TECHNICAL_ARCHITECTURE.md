# Technical Architecture Document
## Bostonia - AI Character Chat Platform

---

## 1. System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────┬─────────────────┬─────────────────┬──────────────────────┤
│   Web App       │   iOS App       │  Android App    │   Creator Studio     │
│   (Next.js)     │   (Swift)       │  (Kotlin)       │   (Next.js)          │
└────────┬────────┴────────┬────────┴────────┬────────┴──────────┬───────────┘
         │                 │                 │                   │
         └─────────────────┴────────┬────────┴───────────────────┘
                                    │
                              ┌─────▼─────┐
                              │    CDN    │ (Cloudflare)
                              └─────┬─────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                         (Kong / AWS API Gateway)                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ Rate Limiting│ │    Auth      │ │   Routing    │ │   Logging    │       │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘       │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                           SERVICE LAYER                                      │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────────┤
│   Auth      │   Chat      │  Character  │   Memory    │    Payment         │
│   Service   │   Service   │  Service    │   Service   │    Service         │
├─────────────┼─────────────┼─────────────┼─────────────┼────────────────────┤
│   User      │   Content   │   Creator   │   Voice     │    Analytics       │
│   Service   │   Mod Svc   │   Service   │   Service   │    Service         │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴─────────┬──────────┘
       │             │             │             │                │
┌──────▼─────────────▼─────────────▼─────────────▼────────────────▼──────────┐
│                           DATA LAYER                                        │
├────────────────┬────────────────┬────────────────┬─────────────────────────┤
│   PostgreSQL   │     Redis      │   Pinecone     │      S3/GCS            │
│   (Primary)    │   (Cache/RT)   │   (Vectors)    │   (Media Storage)      │
└────────────────┴────────────────┴────────────────┴─────────────────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                   │
├─────────────┬─────────────┬─────────────┬─────────────┬────────────────────┤
│  Anthropic  │   OpenAI    │  ElevenLabs │   Stripe    │    Firebase        │
│  (Claude)   │   (GPT)     │   (Voice)   │  (Payments) │    (Push/Auth)     │
└─────────────┴─────────────┴─────────────┴─────────────┴────────────────────┘
```

---

## 2. Core Components

### 2.1 Client Applications

#### Web Application
```
Technology: Next.js 14+ (App Router)
Hosting: Vercel / AWS Amplify
Features:
  - Server-side rendering for SEO
  - Real-time WebSocket chat
  - PWA capabilities
  - Responsive design (mobile-web)
```

#### Mobile Applications
```
iOS: Swift + SwiftUI
Android: Kotlin + Jetpack Compose
Shared:
  - Native WebSocket implementation
  - Local SQLite for offline caching
  - Push notifications (APNs/FCM)
  - Biometric authentication
```

#### Creator Studio
```
Technology: Next.js (separate deployment)
Features:
  - Character builder interface
  - Analytics dashboard
  - Monetization management
  - A/B testing tools
```

### 2.2 API Gateway

```yaml
Technology: Kong / AWS API Gateway
Responsibilities:
  - Request routing
  - Rate limiting (per user, per IP)
  - Authentication verification
  - Request/response transformation
  - API versioning
  - DDoS protection

Rate Limits:
  Free Tier: 100 requests/minute
  Plus Tier: 300 requests/minute
  Pro Tier: 600 requests/minute
  Creator: 1000 requests/minute
```

### 2.3 Microservices

#### Auth Service
```
Technology: Node.js + TypeScript
Database: PostgreSQL
Responsibilities:
  - User registration/login
  - OAuth integration (Google, Apple, Discord)
  - JWT token management
  - Session handling
  - Age verification
  - Password reset flows

Endpoints:
  POST /auth/register
  POST /auth/login
  POST /auth/oauth/{provider}
  POST /auth/refresh
  POST /auth/logout
  POST /auth/verify-age
  POST /auth/forgot-password
```

#### User Service
```
Technology: Node.js + TypeScript
Database: PostgreSQL
Responsibilities:
  - Profile management
  - Preferences & settings
  - Subscription status
  - Credit balance
  - Favorites & collections

Endpoints:
  GET /users/me
  PATCH /users/me
  GET /users/me/preferences
  PATCH /users/me/preferences
  GET /users/me/favorites
  POST /users/me/favorites
  DELETE /users/me/favorites/{id}
```

#### Chat Service
```
Technology: Node.js + TypeScript
Real-time: Socket.io / WebSocket
Database: PostgreSQL + Redis
Responsibilities:
  - Conversation management
  - Real-time message streaming
  - Message history
  - Conversation branching
  - Export functionality

WebSocket Events:
  connect
  disconnect
  message:send
  message:stream
  message:complete
  message:regenerate
  typing:start
  typing:stop

Endpoints:
  GET /conversations
  POST /conversations
  GET /conversations/{id}
  DELETE /conversations/{id}
  GET /conversations/{id}/messages
  POST /conversations/{id}/messages
  POST /conversations/{id}/branch
  GET /conversations/{id}/export
```

#### Character Service
```
Technology: Node.js + TypeScript
Database: PostgreSQL + Elasticsearch
Responsibilities:
  - Character CRUD
  - Character search & discovery
  - Character metadata
  - Ratings & reviews
  - Trending calculations

Endpoints:
  GET /characters
  GET /characters/trending
  GET /characters/search
  GET /characters/{id}
  POST /characters
  PATCH /characters/{id}
  DELETE /characters/{id}
  POST /characters/{id}/rate
  GET /characters/{id}/reviews
```

#### Memory Service
```
Technology: Python + FastAPI
Database: PostgreSQL + Pinecone
Responsibilities:
  - Short-term context management
  - Long-term memory storage
  - Memory retrieval (RAG)
  - Memory summarization
  - Relationship tracking

Endpoints:
  GET /memory/{conversation_id}
  POST /memory/{conversation_id}/facts
  DELETE /memory/{conversation_id}/facts/{id}
  GET /memory/{conversation_id}/relationships
  POST /memory/extract (async)
  GET /memory/{conversation_id}/summary
```

#### AI Orchestration Service
```
Technology: Python + FastAPI
Responsibilities:
  - LLM provider routing
  - Prompt engineering
  - Context assembly
  - Response streaming
  - Cost optimization
  - Fallback handling

Supported Providers:
  - Anthropic Claude (primary)
  - OpenAI GPT-4 (fallback)
  - Open-source models (cost optimization)

Endpoints:
  POST /ai/generate (streaming)
  POST /ai/generate/sync
  GET /ai/models
  POST /ai/moderate
```

#### Content Moderation Service
```
Technology: Python + FastAPI
Responsibilities:
  - Input classification
  - Output filtering
  - User report handling
  - Automated flagging
  - Content tier assignment

Endpoints:
  POST /moderate/text
  POST /moderate/image
  POST /reports
  GET /reports (admin)
```

#### Voice Service
```
Technology: Node.js + TypeScript
External: ElevenLabs / PlayHT
Responsibilities:
  - Text-to-speech conversion
  - Voice selection
  - Audio streaming
  - Speech-to-text (future)

Endpoints:
  POST /voice/synthesize
  GET /voice/voices
  WebSocket: /voice/stream
```

#### Payment Service
```
Technology: Node.js + TypeScript
External: Stripe
Responsibilities:
  - Subscription management
  - Credit purchases
  - Creator payouts
  - Invoice generation
  - Webhook handling

Endpoints:
  POST /payments/subscribe
  POST /payments/cancel
  POST /payments/credits
  GET /payments/history
  POST /payments/webhook (Stripe)
  GET /creator/earnings
  POST /creator/payout
```

#### Creator Service
```
Technology: Node.js + TypeScript
Database: PostgreSQL
Responsibilities:
  - Creator profiles
  - Revenue tracking
  - Analytics
  - Payout management

Endpoints:
  GET /creator/profile
  PATCH /creator/profile
  GET /creator/analytics
  GET /creator/characters
  GET /creator/earnings
```

#### Analytics Service
```
Technology: Python + FastAPI
Database: ClickHouse / TimescaleDB
Responsibilities:
  - Event tracking
  - User behavior analysis
  - Business metrics
  - Real-time dashboards

Events Tracked:
  - conversation_started
  - message_sent
  - character_viewed
  - subscription_changed
  - credit_purchased
  - feature_used
```

---

## 3. Data Architecture

### 3.1 Database Schema (PostgreSQL)

```sql
-- Users & Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url TEXT,
    age_verified BOOLEAN DEFAULT FALSE,
    content_tier VARCHAR(20) DEFAULT 'sfw', -- sfw, mature, adult
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    theme VARCHAR(20) DEFAULT 'system',
    language VARCHAR(10) DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    memory_visible BOOLEAN DEFAULT TRUE,
    typing_indicators BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    tier VARCHAR(20) NOT NULL, -- free, plus, pro, creator
    status VARCHAR(20) NOT NULL, -- active, cancelled, past_due
    stripe_subscription_id VARCHAR(255),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE credit_balances (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    balance INTEGER DEFAULT 0,
    lifetime_purchased INTEGER DEFAULT 0,
    lifetime_earned INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    tagline VARCHAR(200),
    description TEXT,
    avatar_url TEXT,
    personality JSONB, -- traits, style, etc.
    backstory TEXT,
    system_prompt TEXT,
    greeting TEXT,
    example_dialogue JSONB,
    visibility VARCHAR(20) DEFAULT 'private', -- private, unlisted, public
    content_tier VARCHAR(20) DEFAULT 'sfw',
    is_premium BOOLEAN DEFAULT FALSE,
    premium_credits INTEGER DEFAULT 0,
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE character_tags (
    character_id UUID REFERENCES characters(id),
    tag VARCHAR(50),
    PRIMARY KEY (character_id, tag)
);

CREATE TABLE character_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID REFERENCES characters(id),
    user_id UUID REFERENCES users(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(character_id, user_id)
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    character_id UUID REFERENCES characters(id),
    title VARCHAR(200),
    last_message_at TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    parent_id UUID REFERENCES messages(id), -- for branching
    role VARCHAR(20) NOT NULL, -- user, assistant, system
    content TEXT NOT NULL,
    tokens_used INTEGER,
    model_used VARCHAR(50),
    is_regeneration BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory System
CREATE TABLE conversation_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    memory_type VARCHAR(30), -- fact, relationship, event, preference
    content TEXT NOT NULL,
    importance DECIMAL(3,2) DEFAULT 0.5, -- 0-1 scale
    embedding_id VARCHAR(255), -- Pinecone ID
    last_accessed TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    summary_type VARCHAR(20), -- recent, full, relationship
    content TEXT NOT NULL,
    message_range_start UUID REFERENCES messages(id),
    message_range_end UUID REFERENCES messages(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lorebooks
CREATE TABLE lorebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    visibility VARCHAR(20) DEFAULT 'private',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lorebook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lorebook_id UUID REFERENCES lorebooks(id),
    entry_type VARCHAR(30), -- character, location, item, event, faction
    name VARCHAR(100) NOT NULL,
    content TEXT,
    keywords JSONB, -- trigger words for injection
    embedding_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creator & Monetization
CREATE TABLE creator_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    bio TEXT,
    website_url TEXT,
    social_links JSONB,
    revenue_share_rate DECIMAL(3,2) DEFAULT 0.70, -- 70%
    total_earnings DECIMAL(12,2) DEFAULT 0,
    pending_payout DECIMAL(12,2) DEFAULT 0,
    stripe_connect_id VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE creator_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    character_id UUID REFERENCES characters(id),
    earning_type VARCHAR(30), -- subscription_share, tip, premium_unlock
    gross_amount DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    net_amount DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID REFERENCES users(id),
    amount DECIMAL(10,2),
    status VARCHAR(20), -- pending, processing, completed, failed
    stripe_transfer_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Favorites & Collections
CREATE TABLE user_favorites (
    user_id UUID REFERENCES users(id),
    character_id UUID REFERENCES characters(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE collection_characters (
    collection_id UUID REFERENCES collections(id),
    character_id UUID REFERENCES characters(id),
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (collection_id, character_id)
);

-- Indexes
CREATE INDEX idx_characters_creator ON characters(creator_id);
CREATE INDEX idx_characters_visibility ON characters(visibility);
CREATE INDEX idx_characters_content_tier ON characters(content_tier);
CREATE INDEX idx_characters_rating ON characters(avg_rating DESC);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_memories_conversation ON conversation_memories(conversation_id);
```

### 3.2 Redis Schema

```
# Session Management
session:{session_id} -> {user_id, created_at, expires_at}
TTL: 24 hours

# Rate Limiting
ratelimit:{user_id}:{endpoint} -> count
TTL: 1 minute

# Real-time Presence
presence:{user_id} -> {status, last_seen, current_conversation}
TTL: 5 minutes

# Chat Typing Indicators
typing:{conversation_id} -> [user_ids...]
TTL: 10 seconds

# Conversation Context Cache
context:{conversation_id} -> {recent_messages, active_memories}
TTL: 30 minutes

# Character Stats Cache
char_stats:{character_id} -> {views, conversations, rating}
TTL: 5 minutes

# Trending Cache
trending:characters -> [character_ids...]
TTL: 1 hour

# User Credit Balance (Hot Cache)
credits:{user_id} -> balance
TTL: 5 minutes
```

### 3.3 Vector Database (Pinecone)

```yaml
Index: bostonia-memories
Dimensions: 1536 (OpenAI ada-002)
Metric: cosine

Metadata Schema:
  - conversation_id: string
  - user_id: string
  - memory_type: string (fact|relationship|event|preference)
  - importance: float
  - created_at: timestamp
  - content_preview: string (first 100 chars)

Index: bostonia-lorebook
Dimensions: 1536
Metric: cosine

Metadata Schema:
  - lorebook_id: string
  - entry_type: string
  - keywords: string[]
  - created_at: timestamp
```

---

## 4. Memory System Architecture

### 4.1 Memory Nexus Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      MEMORY NEXUS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  Short-Term  │   │   Long-Term  │   │  Episodic    │        │
│  │   Memory     │   │    Memory    │   │   Memory     │        │
│  │              │   │              │   │              │        │
│  │ • Last 20    │   │ • Facts      │   │ • Key events │        │
│  │   messages   │   │ • Preferences│   │ • Milestones │        │
│  │ • Active     │   │ • Relations  │   │ • Emotional  │        │
│  │   context    │   │              │   │   moments    │        │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ▼                                    │
│                 ┌──────────────────┐                           │
│                 │ Context Assembler │                           │
│                 └────────┬─────────┘                           │
│                          ▼                                      │
│                 ┌──────────────────┐                           │
│                 │   Final Prompt   │                           │
│                 │   + Memories     │                           │
│                 └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Memory Pipeline

```python
# Memory Extraction Pipeline (Async)

async def extract_memories(conversation_id: str, new_messages: List[Message]):
    """
    Run after each conversation turn to extract and store memories.
    Executes asynchronously to not block chat response.
    """

    # 1. Extract facts from conversation
    facts = await llm_extract_facts(new_messages)

    # 2. Update relationships
    relationships = await llm_extract_relationships(new_messages)

    # 3. Identify key events
    events = await llm_identify_events(new_messages)

    # 4. Score importance
    scored_memories = score_importance(facts + relationships + events)

    # 5. Generate embeddings
    embeddings = await embed_memories(scored_memories)

    # 6. Store in Pinecone
    await pinecone_upsert(embeddings, conversation_id)

    # 7. Store in PostgreSQL
    await pg_store_memories(scored_memories, conversation_id)

    # 8. Update summary if needed
    if should_update_summary(conversation_id):
        await update_conversation_summary(conversation_id)
```

### 4.3 Context Assembly

```python
async def assemble_context(
    conversation_id: str,
    character: Character,
    user_message: str,
    max_tokens: int = 4000
) -> str:
    """
    Assemble the complete context for LLM generation.
    """

    context_parts = []
    remaining_tokens = max_tokens

    # 1. System prompt (always included)
    system_prompt = build_system_prompt(character)
    context_parts.append(system_prompt)
    remaining_tokens -= count_tokens(system_prompt)

    # 2. Retrieve relevant long-term memories
    query_embedding = await embed_text(user_message)
    memories = await pinecone_query(
        query_embedding,
        filter={"conversation_id": conversation_id},
        top_k=10
    )

    memory_text = format_memories(memories)
    if count_tokens(memory_text) < remaining_tokens * 0.2:
        context_parts.append(f"[MEMORIES]\n{memory_text}")
        remaining_tokens -= count_tokens(memory_text)

    # 3. Include conversation summary if long conversation
    if get_message_count(conversation_id) > 50:
        summary = await get_conversation_summary(conversation_id)
        context_parts.append(f"[STORY SO FAR]\n{summary}")
        remaining_tokens -= count_tokens(summary)

    # 4. Recent messages (sliding window)
    recent_messages = await get_recent_messages(
        conversation_id,
        max_tokens=remaining_tokens - 500  # Reserve for response
    )
    context_parts.append(format_messages(recent_messages))

    # 5. Lorebook entries (if active)
    if lorebook := get_active_lorebook(conversation_id):
        relevant_lore = await query_lorebook(lorebook.id, user_message)
        if relevant_lore:
            context_parts.append(f"[WORLD INFO]\n{relevant_lore}")

    return "\n\n".join(context_parts)
```

---

## 5. AI Orchestration

### 5.1 Multi-Model Strategy

```yaml
Primary Provider: Anthropic Claude
  Model: claude-3-5-sonnet
  Use Cases: Standard chat, creative writing
  Cost: ~$0.003/1K input, $0.015/1K output

Creative Mode: Anthropic Claude
  Model: claude-3-opus
  Use Cases: Premium creative, complex roleplay
  Cost: ~$0.015/1K input, $0.075/1K output

Fallback Provider: OpenAI
  Model: gpt-4-turbo
  Use Cases: When Claude unavailable
  Cost: ~$0.01/1K input, $0.03/1K output

Cost Optimization: Open Source
  Model: Mixtral 8x7B (via Together.ai)
  Use Cases: Simple queries, cost reduction
  Cost: ~$0.0006/1K tokens
```

### 5.2 Streaming Implementation

```typescript
// Chat streaming endpoint
async function* streamChatResponse(
  conversationId: string,
  userMessage: string,
  character: Character
): AsyncGenerator<string> {
  // Assemble context
  const context = await assembleContext(conversationId, character, userMessage);

  // Select model based on user tier and character settings
  const model = selectModel(user.tier, character.settings);

  // Start streaming from LLM
  const stream = await llmClient.createChatCompletion({
    model: model,
    messages: [
      { role: "system", content: context },
      { role: "user", content: userMessage }
    ],
    stream: true,
    max_tokens: 1000,
    temperature: character.personality.temperature || 0.8
  });

  let fullResponse = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    fullResponse += content;
    yield content;
  }

  // Post-processing (async, don't block)
  queueMemoryExtraction(conversationId, userMessage, fullResponse);
  updateConversationStats(conversationId);
  deductCredits(user.id, model);
}
```

---

## 6. Real-Time Infrastructure

### 6.1 WebSocket Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WEBSOCKET LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Client 1   │    │  Client 2   │    │  Client N   │        │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│          │                  │                  │                 │
│          └──────────────────┼──────────────────┘                 │
│                             ▼                                    │
│                    ┌─────────────────┐                          │
│                    │  Load Balancer  │                          │
│                    │   (Sticky WS)   │                          │
│                    └────────┬────────┘                          │
│                             ▼                                    │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │  WS Server  │  │  WS Server  │  │  WS Server  │            │
│   │     #1      │  │     #2      │  │     #N      │            │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│          │                │                │                    │
│          └────────────────┼────────────────┘                    │
│                           ▼                                      │
│                  ┌─────────────────┐                            │
│                  │   Redis Pub/Sub │                            │
│                  │  (Cross-server  │                            │
│                  │   messaging)    │                            │
│                  └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Socket.io Events

```typescript
// Server-side Socket.io implementation

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;

  // Join user's room
  socket.join(`user:${userId}`);

  // Join conversation room
  socket.on('conversation:join', async (conversationId) => {
    // Verify user has access
    if (await canAccessConversation(userId, conversationId)) {
      socket.join(`conv:${conversationId}`);
      socket.emit('conversation:joined', conversationId);
    }
  });

  // Handle message sending
  socket.on('message:send', async (data) => {
    const { conversationId, content } = data;

    // Store user message
    const userMessage = await storeMessage(conversationId, 'user', content);

    // Broadcast user message
    io.to(`conv:${conversationId}`).emit('message:received', userMessage);

    // Start AI response streaming
    const character = await getCharacter(conversationId);
    const stream = streamChatResponse(conversationId, content, character);

    let aiMessageId = generateId();
    io.to(`conv:${conversationId}`).emit('message:stream:start', { id: aiMessageId });

    for await (const chunk of stream) {
      io.to(`conv:${conversationId}`).emit('message:stream:chunk', {
        id: aiMessageId,
        content: chunk
      });
    }

    io.to(`conv:${conversationId}`).emit('message:stream:complete', { id: aiMessageId });
  });

  // Typing indicators
  socket.on('typing:start', (conversationId) => {
    socket.to(`conv:${conversationId}`).emit('typing:start', userId);
  });

  socket.on('typing:stop', (conversationId) => {
    socket.to(`conv:${conversationId}`).emit('typing:stop', userId);
  });

  // Handle regeneration
  socket.on('message:regenerate', async (data) => {
    const { conversationId, messageId } = data;
    // Similar to message:send but regenerates from a specific point
  });
});
```

---

## 7. Infrastructure & DevOps

### 7.1 Cloud Architecture (AWS)

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │ CloudFront   │──────────────────────────────────┐            │
│  │    (CDN)     │                                  │            │
│  └──────┬───────┘                                  │            │
│         │                                          │            │
│         ▼                                          ▼            │
│  ┌──────────────┐                          ┌──────────────┐    │
│  │     ALB      │                          │     S3       │    │
│  │ (Load Bal.)  │                          │  (Static)    │    │
│  └──────┬───────┘                          └──────────────┘    │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────┐                  │
│  │              EKS Cluster                  │                  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐       │                  │
│  │  │  API   │ │  Chat  │ │ Memory │       │                  │
│  │  │ Pods   │ │  Pods  │ │  Pods  │       │                  │
│  │  └────────┘ └────────┘ └────────┘       │                  │
│  └──────────────────┬───────────────────────┘                  │
│                     │                                           │
│         ┌───────────┼───────────┐                              │
│         ▼           ▼           ▼                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │   RDS    │ │ElastiCache│ │   SQS    │                       │
│  │(Postgres)│ │  (Redis)  │ │ (Queues) │                       │
│  └──────────┘ └──────────┘ └──────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Kubernetes Configuration

```yaml
# Deployment: Chat Service
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-service
  template:
    metadata:
      labels:
        app: chat-service
    spec:
      containers:
      - name: chat-service
        image: bostonia/chat-service:latest
        ports:
        - containerPort: 3000
        - containerPort: 3001  # WebSocket
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
# HPA: Auto-scaling
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: chat-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: chat-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 7.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ secrets.ECR_REGISTRY }}
          username: ${{ secrets.AWS_ACCESS_KEY_ID }}
          password: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/bostonia:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          aws eks update-kubeconfig --name bostonia-cluster
          kubectl set image deployment/chat-service \
            chat-service=${{ secrets.ECR_REGISTRY }}/bostonia:${{ github.sha }}
```

---

## 8. Security Architecture

### 8.1 Authentication Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐        ┌─────────┐        ┌─────────┐              │
│  │ Client  │───────▶│   API   │───────▶│  Auth   │              │
│  │         │        │ Gateway │        │ Service │              │
│  └─────────┘        └─────────┘        └────┬────┘              │
│       │                                      │                   │
│       │                                      ▼                   │
│       │                              ┌─────────────┐            │
│       │                              │  Validate   │            │
│       │                              │ Credentials │            │
│       │                              └──────┬──────┘            │
│       │                                     │                    │
│       │                                     ▼                    │
│       │                              ┌─────────────┐            │
│       │                              │  Generate   │            │
│       │                              │    JWT      │            │
│       │                              └──────┬──────┘            │
│       │                                     │                    │
│       │◀────────────────────────────────────┘                   │
│       │           (Access Token + Refresh Token)                │
│       │                                                          │
│       │  Subsequent Requests:                                    │
│       │  Authorization: Bearer <access_token>                    │
│       │                                                          │
└──────────────────────────────────────────────────────────────────┘

JWT Payload:
{
  "sub": "user_id",
  "email": "user@example.com",
  "tier": "plus",
  "age_verified": true,
  "content_tier": "mature",
  "iat": 1706500000,
  "exp": 1706503600
}
```

### 8.2 Security Measures

```yaml
Transport Security:
  - TLS 1.3 for all connections
  - HSTS enabled
  - Certificate pinning (mobile)

Data Security:
  - AES-256 encryption at rest
  - Field-level encryption for sensitive data
  - PII anonymization for analytics

Application Security:
  - Input validation on all endpoints
  - Output encoding (XSS prevention)
  - CSRF tokens for state-changing operations
  - Rate limiting per user and IP
  - SQL injection prevention (parameterized queries)

Infrastructure Security:
  - VPC isolation
  - WAF rules (Cloudflare/AWS WAF)
  - DDoS protection
  - Secrets management (AWS Secrets Manager)
  - Audit logging (CloudTrail)

Content Security:
  - Age verification for mature content
  - Content classification pipeline
  - User reporting system
  - Automated threat detection
```

---

## 9. Monitoring & Observability

### 9.1 Monitoring Stack

```yaml
Metrics: Prometheus + Grafana
  - Request latency (P50, P95, P99)
  - Error rates
  - Active connections
  - Queue depths
  - AI inference times
  - Credit consumption

Logging: ELK Stack (Elasticsearch, Logstash, Kibana)
  - Structured JSON logs
  - Request/response logging
  - Error tracking
  - Audit trails

Tracing: Jaeger / AWS X-Ray
  - Distributed tracing
  - Request flow visualization
  - Latency analysis

Alerting: PagerDuty / Opsgenie
  - Error rate spikes
  - Latency degradation
  - Service health
  - Cost anomalies
```

### 9.2 Key Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOSTONIA DASHBOARD                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Active Users      Messages/min      Avg Response     Error Rate │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐    ┌────────┐│
│  │  12,453  │      │   8,234  │      │   1.8s   │    │  0.1%  ││
│  │   ↑ 12%  │      │   ↑ 8%   │      │   ↓ 5%   │    │  ─     ││
│  └──────────┘      └──────────┘      └──────────┘    └────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Request Latency (P95)                  │   │
│  │                                                           │   │
│  │  2.5s ┤                                                   │   │
│  │       │      ╭─╮                                          │   │
│  │  2.0s ┤     ╭╯ ╰╮     ╭─╮                                │   │
│  │       │    ╭╯   ╰╮   ╭╯ ╰╮                               │   │
│  │  1.5s ┤───╯     ╰───╯   ╰─────────────────────────────  │   │
│  │       │                                                   │   │
│  │  1.0s ┤                                                   │   │
│  │       ├───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───  │   │
│  │         00  02  04  06  08  10  12  14  16  18  20  22   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  AI Costs Today: $1,234.56    Credits Consumed: 2.3M            │
│  Active Subs: 12,453          Revenue Today: $4,567.89          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Cost Estimation

### 10.1 Infrastructure Costs (Monthly)

| Component | Specification | Est. Cost |
|-----------|--------------|-----------|
| EKS Cluster | 3 x m5.large | $350 |
| RDS PostgreSQL | db.r5.large, Multi-AZ | $500 |
| ElastiCache Redis | cache.r5.large | $300 |
| S3 Storage | 1TB | $25 |
| CloudFront | 10TB transfer | $850 |
| Pinecone | Standard | $70 |
| **Subtotal Infrastructure** | | **~$2,100** |

### 10.2 AI Costs (Per 100K MAU)

| Provider | Usage | Est. Cost |
|----------|-------|-----------|
| Anthropic Claude | 50M tokens/day | $45,000 |
| OpenAI (fallback) | 5M tokens/day | $1,500 |
| ElevenLabs (voice) | 1M chars/day | $3,000 |
| **Subtotal AI** | | **~$50,000** |

### 10.3 Cost Optimization Strategies

1. **Aggressive Caching** - Cache similar query responses
2. **Context Compression** - Reduce token usage via summarization
3. **Tiered Models** - Use cheaper models for simple queries
4. **Rate Limiting** - Prevent abuse and runaway costs
5. **Batch Processing** - Batch memory extraction off-peak

---

*Document Version: 1.0*
*Last Updated: January 28, 2026*
