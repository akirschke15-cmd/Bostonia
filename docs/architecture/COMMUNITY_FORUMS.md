# Community Forums Architecture Document
## Bostonia Week 12 - Community Feature

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model & Relationships](#2-data-model--relationships)
3. [API Endpoint Design](#3-api-endpoint-design)
4. [Moderation System](#4-moderation-system)
5. [Caching Strategy](#5-caching-strategy)
6. [Real-time Updates](#6-real-time-updates)
7. [Search & Discovery](#7-search--discovery)
8. [Security Considerations](#8-security-considerations)
9. [Performance Optimization](#9-performance-optimization)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Overview

### 1.1 Purpose

The Community Forums system enables Bostonia users to engage with each other, share experiences, discuss characters, request features, and build a vibrant community around the platform. This feature aims to:

- Increase user engagement and retention
- Provide a support channel for users to help each other
- Gather feedback and feature requests
- Build community around character creation and sharing
- Reduce support burden through community-driven Q&A

### 1.2 Architecture Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COMMUNITY FORUMS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │   Next.js   │    │   Forum     │    │   Search    │                    │
│   │   Frontend  │    │   Service   │    │   Service   │                    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                    │
│          │                  │                  │                            │
│          └──────────────────┼──────────────────┘                            │
│                             │                                                │
│                    ┌────────▼────────┐                                      │
│                    │   API Gateway   │                                      │
│                    │   (Rate Limit)  │                                      │
│                    └────────┬────────┘                                      │
│                             │                                                │
│          ┌──────────────────┼──────────────────┐                            │
│          │                  │                  │                            │
│   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐                    │
│   │  PostgreSQL │    │    Redis    │    │  Socket.IO  │                    │
│   │  (Primary)  │    │   (Cache)   │    │  (Realtime) │                    │
│   └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Categories | Organized topic areas | P0 |
| Threads | Discussion topics with posts | P0 |
| Posts/Replies | User contributions | P0 |
| Reactions | Like, helpful, funny reactions | P1 |
| Pinning | Highlight important threads | P1 |
| Locking | Close threads to new replies | P1 |
| Moderation | Content management tools | P0 |
| Search | Full-text thread/post search | P1 |
| Real-time | Live updates for new posts | P2 |

---

## 2. Data Model & Relationships

### 2.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FORUM DATA MODEL                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐                                                       │
│  │  ForumCategory   │                                                       │
│  │──────────────────│                                                       │
│  │ id (PK)          │                                                       │
│  │ name             │                                                       │
│  │ slug (unique)    │                                                       │
│  │ description      │                                                       │
│  │ icon             │                                                       │
│  │ sortOrder        │                                                       │
│  │ isActive         │                                                       │
│  └────────┬─────────┘                                                       │
│           │ 1:N                                                              │
│           ▼                                                                  │
│  ┌──────────────────┐         ┌──────────────────┐                         │
│  │   ForumThread    │         │       User       │                         │
│  │──────────────────│         │──────────────────│                         │
│  │ id (PK)          │◄────────│ id (PK)          │                         │
│  │ categoryId (FK)  │         │ username         │                         │
│  │ authorId (FK)    │─────────│ displayName      │                         │
│  │ title            │         │ avatarUrl        │                         │
│  │ content          │         │ role             │                         │
│  │ isPinned         │         └──────────────────┘                         │
│  │ isLocked         │              │                                        │
│  │ viewCount        │              │                                        │
│  │ replyCount       │              │                                        │
│  │ lastReplyAt      │              │                                        │
│  │ lastReplyById(FK)│──────────────┘                                        │
│  └────────┬─────────┘                                                       │
│           │ 1:N                                                              │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │    ForumPost     │                                                       │
│  │──────────────────│                                                       │
│  │ id (PK)          │                                                       │
│  │ threadId (FK)    │                                                       │
│  │ authorId (FK)    │─────────────► User                                   │
│  │ content          │                                                       │
│  │ isEdited         │                                                       │
│  └────────┬─────────┘                                                       │
│           │ 1:N                                                              │
│           ▼                                                                  │
│  ┌──────────────────┐                                                       │
│  │  ForumReaction   │                                                       │
│  │──────────────────│                                                       │
│  │ id (PK)          │                                                       │
│  │ postId (FK)      │                                                       │
│  │ userId (FK)      │─────────────► User                                   │
│  │ type             │                                                       │
│  └──────────────────┘                                                       │
│                                                                              │
│  Constraints:                                                                │
│  - ForumReaction: @@unique([postId, userId, type])                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Schema Definitions

```prisma
model ForumCategory {
  id          String   @id @default(cuid())
  name        String   @unique        // "General Discussion"
  slug        String   @unique        // "general-discussion"
  description String?                 // Category description
  icon        String?                 // Emoji or icon name
  sortOrder   Int      @default(0)    // Display order
  isActive    Boolean  @default(true) // Soft visibility control
  createdAt   DateTime @default(now())

  threads     ForumThread[]

  @@index([slug])
  @@index([sortOrder])
}

model ForumThread {
  id           String   @id @default(cuid())
  categoryId   String                     // Parent category
  authorId     String                     // Thread creator
  title        String                     // Thread title (max 200 chars)
  content      String   @db.Text          // Initial post content
  isPinned     Boolean  @default(false)   // Sticky thread
  isLocked     Boolean  @default(false)   // No new replies
  viewCount    Int      @default(0)       // View tracking
  replyCount   Int      @default(0)       // Denormalized count
  lastReplyAt  DateTime?                  // For sorting by activity
  lastReplyById String?                   // Last reply author
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  category     ForumCategory @relation(...)
  author       User @relation("ThreadAuthor", ...)
  lastReplyBy  User? @relation("ThreadLastReply", ...)
  posts        ForumPost[]

  @@index([categoryId])
  @@index([authorId])
  @@index([isPinned, createdAt])       // For sorted listing
  @@index([lastReplyAt])               // For activity sorting
}

model ForumPost {
  id        String   @id @default(cuid())
  threadId  String                        // Parent thread
  authorId  String                        // Post author
  content   String   @db.Text             // Post content
  isEdited  Boolean  @default(false)      // Edit indicator
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  thread    ForumThread @relation(fields: [threadId], references: [id], onDelete: Cascade)
  author    User @relation(...)
  reactions ForumReaction[]

  @@index([threadId])
  @@index([authorId])
  @@index([createdAt])
}

model ForumReaction {
  id        String   @id @default(cuid())
  postId    String                        // Target post
  userId    String                        // Reacting user
  type      String                        // Reaction type
  createdAt DateTime @default(now())

  post      ForumPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  user      User @relation(...)

  @@unique([postId, userId, type])      // One reaction per type per user
  @@index([postId])
  @@index([userId])
}
```

### 2.3 Reaction Types

```typescript
type ReactionType = 'like' | 'helpful' | 'funny';

const REACTION_ICONS: Record<ReactionType, string> = {
  like: '👍',
  helpful: '💡',
  funny: '😂',
};

const REACTION_LABELS: Record<ReactionType, string> = {
  like: 'Like',
  helpful: 'Helpful',
  funny: 'Funny',
};
```

### 2.4 Denormalization Strategy

To avoid expensive COUNT queries on every page load, we denormalize certain counts:

| Field | Table | Updated When |
|-------|-------|--------------|
| `replyCount` | ForumThread | Post created/deleted |
| `lastReplyAt` | ForumThread | Post created |
| `lastReplyById` | ForumThread | Post created |
| `viewCount` | ForumThread | Thread viewed (debounced) |

```typescript
// Example: After creating a post
await prisma.$transaction([
  prisma.forumPost.create({ data: postData }),
  prisma.forumThread.update({
    where: { id: threadId },
    data: {
      replyCount: { increment: 1 },
      lastReplyAt: new Date(),
      lastReplyById: userId,
    },
  }),
]);
```

---

## 3. API Endpoint Design

### 3.1 Endpoint Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FORUM API ENDPOINTS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CATEGORIES                                                                  │
│  ├── GET    /api/forums/categories              List all categories         │
│  └── GET    /api/forums/categories/:slug        Get category details        │
│                                                                              │
│  THREADS                                                                     │
│  ├── GET    /api/forums/categories/:slug/threads  List threads in category │
│  ├── POST   /api/forums/threads                   Create new thread         │
│  ├── GET    /api/forums/threads/:id               Get thread with posts     │
│  ├── PATCH  /api/forums/threads/:id               Update thread             │
│  └── DELETE /api/forums/threads/:id               Delete thread             │
│                                                                              │
│  POSTS                                                                       │
│  ├── POST   /api/forums/threads/:id/posts         Add reply to thread      │
│  ├── PATCH  /api/forums/posts/:id                 Edit post                │
│  └── DELETE /api/forums/posts/:id                 Delete post              │
│                                                                              │
│  REACTIONS                                                                   │
│  ├── POST   /api/forums/posts/:id/reactions       Add reaction             │
│  └── DELETE /api/forums/posts/:id/reactions/:type Remove reaction          │
│                                                                              │
│  MODERATION (Admin/Moderator only)                                          │
│  ├── POST   /api/forums/threads/:id/pin           Pin/unpin thread         │
│  ├── POST   /api/forums/threads/:id/lock          Lock/unlock thread       │
│  └── DELETE /api/forums/moderation/content/:id    Force delete content     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Request/Response Patterns

#### List Categories
```typescript
// GET /api/forums/categories
interface CategoryListResponse {
  success: true;
  data: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    threadCount: number;     // Computed or cached
    latestThread: {
      id: string;
      title: string;
      authorUsername: string;
      createdAt: string;
    } | null;
  }[];
}
```

#### List Threads
```typescript
// GET /api/forums/categories/:slug/threads?page=1&limit=20&sort=latest
interface ThreadListResponse {
  success: true;
  data: {
    id: string;
    title: string;
    author: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
    isPinned: boolean;
    isLocked: boolean;
    viewCount: number;
    replyCount: number;
    lastReplyAt: string | null;
    lastReplyBy: {
      id: string;
      username: string;
    } | null;
    createdAt: string;
  }[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Sort options: 'latest' | 'oldest' | 'most_replies' | 'most_views'
```

#### Get Thread with Posts
```typescript
// GET /api/forums/threads/:id?page=1&limit=50
interface ThreadDetailResponse {
  success: true;
  data: {
    thread: {
      id: string;
      categoryId: string;
      category: {
        name: string;
        slug: string;
      };
      title: string;
      content: string;
      author: UserSummary;
      isPinned: boolean;
      isLocked: boolean;
      viewCount: number;
      replyCount: number;
      createdAt: string;
      updatedAt: string;
    };
    posts: {
      id: string;
      content: string;
      author: UserSummary;
      isEdited: boolean;
      createdAt: string;
      updatedAt: string;
      reactions: {
        type: string;
        count: number;
        userReacted: boolean;  // Did current user react with this type
      }[];
    }[];
    meta: PaginationMeta;
  };
}
```

#### Create Thread
```typescript
// POST /api/forums/threads
interface CreateThreadRequest {
  categoryId: string;
  title: string;        // 5-200 characters
  content: string;      // 10-50000 characters
}

interface CreateThreadResponse {
  success: true;
  data: {
    id: string;
    slug: string;       // URL-friendly slug from title
    // ... full thread details
  };
}
```

### 3.3 Validation Rules

```typescript
const threadValidation = {
  title: z.string().min(5).max(200),
  content: z.string().min(10).max(50000),
};

const postValidation = {
  content: z.string().min(1).max(50000),
};

const reactionValidation = {
  type: z.enum(['like', 'helpful', 'funny']),
};
```

---

## 4. Moderation System

### 4.1 Moderation Roles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MODERATION PERMISSION MATRIX                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Action                  │ User │ Creator │ Moderator │ Admin │             │
│  ────────────────────────┼──────┼─────────┼───────────┼───────┤             │
│  Create thread           │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Edit own thread         │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Delete own thread       │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Create post             │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Edit own post           │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Delete own post         │  ✓   │    ✓    │     ✓     │   ✓   │             │
│  Edit any thread         │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Delete any thread       │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Edit any post           │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Delete any post         │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Pin/Unpin threads       │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Lock/Unlock threads     │  ✗   │    ✗    │     ✓     │   ✓   │             │
│  Manage categories       │  ✗   │    ✗    │     ✗     │   ✓   │             │
│  View moderation logs    │  ✗   │    ✗    │     ✓     │   ✓   │             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Content Moderation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTENT MODERATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Creates Post                                                           │
│        │                                                                     │
│        ▼                                                                     │
│  ┌──────────────┐                                                           │
│  │ Auto-Filter  │  Check against:                                           │
│  │ (Pre-save)   │  - Spam patterns                                          │
│  └──────┬───────┘  - Blocked words                                          │
│         │          - URL patterns                                            │
│         │                                                                    │
│    ┌────┴────┐                                                              │
│    │         │                                                              │
│  Clean    Flagged                                                           │
│    │         │                                                              │
│    ▼         ▼                                                              │
│  ┌──────┐  ┌──────────────┐                                                │
│  │ Save │  │ Hold for     │                                                │
│  │ Post │  │ Review       │                                                │
│  └──────┘  └──────┬───────┘                                                │
│                   │                                                          │
│           ┌───────┴───────┐                                                 │
│           │               │                                                 │
│       Approved        Rejected                                              │
│           │               │                                                 │
│           ▼               ▼                                                 │
│       Published       Notify User                                           │
│                       + Log Action                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Automated Moderation

```typescript
interface ModerationConfig {
  // Spam detection
  minAccountAgeDays: number;        // 0 = immediate posting
  newUserRateLimit: number;         // Posts per hour for new users
  linkLimit: number;                // Max links per post

  // Content filtering
  blockedWords: string[];           // Exact matches
  blockedPatterns: RegExp[];        // Regex patterns
  requireApproval: boolean;         // Hold all posts for review

  // Auto-actions
  autoLockAfterDays: number;        // Auto-lock inactive threads
  autoArchiveAfterDays: number;     // Move to archive
}

async function moderateContent(content: string, userId: string): Promise<ModerationResult> {
  const checks = await Promise.all([
    checkSpamPatterns(content),
    checkBlockedWords(content),
    checkUserReputation(userId),
    checkRateLimit(userId),
  ]);

  return {
    approved: checks.every(c => c.passed),
    flags: checks.filter(c => !c.passed).map(c => c.reason),
    requiresReview: checks.some(c => c.requiresReview),
  };
}
```

### 4.4 Moderation Logging

```typescript
interface ForumModerationLog {
  id: string;
  action: ModerationAction;
  contentType: 'thread' | 'post';
  contentId: string;
  moderatorId: string;
  reason: string;
  previousState: unknown;      // For reversibility
  createdAt: Date;
}

type ModerationAction =
  | 'pin'
  | 'unpin'
  | 'lock'
  | 'unlock'
  | 'edit'
  | 'delete'
  | 'hide'
  | 'restore';
```

---

## 5. Caching Strategy

### 5.1 Cache Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CACHING ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           REDIS CACHE                                  │  │
│  │                                                                        │  │
│  │  Layer 1: Hot Data (TTL: 60s)                                         │  │
│  │  ├── forum:categories                     Category list                │  │
│  │  ├── forum:category:{slug}:threads:1      First page of threads       │  │
│  │  └── forum:thread:{id}:hot                Popular thread content      │  │
│  │                                                                        │  │
│  │  Layer 2: Warm Data (TTL: 5min)                                       │  │
│  │  ├── forum:thread:{id}                    Thread details              │  │
│  │  ├── forum:thread:{id}:posts:1            First page of posts         │  │
│  │  └── forum:post:{id}:reactions            Reaction counts             │  │
│  │                                                                        │  │
│  │  Layer 3: Counters (No TTL, increment only)                           │  │
│  │  ├── forum:thread:{id}:views              View counter (batch sync)   │  │
│  │  └── forum:user:{id}:post_count           User post count             │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Cache Keys Pattern

```typescript
const CACHE_KEYS = {
  // Category caching
  categories: 'forum:categories',
  categoryDetail: (slug: string) => `forum:category:${slug}`,

  // Thread caching
  threadList: (categorySlug: string, page: number, sort: string) =>
    `forum:category:${categorySlug}:threads:${page}:${sort}`,
  threadDetail: (threadId: string) => `forum:thread:${threadId}`,
  threadHot: (threadId: string) => `forum:thread:${threadId}:hot`,

  // Post caching
  postList: (threadId: string, page: number) =>
    `forum:thread:${threadId}:posts:${page}`,
  postReactions: (postId: string) => `forum:post:${postId}:reactions`,

  // Counter caching
  threadViews: (threadId: string) => `forum:thread:${threadId}:views`,
  userPostCount: (userId: string) => `forum:user:${userId}:posts`,
};

const CACHE_TTL = {
  categories: 300,        // 5 minutes
  threadList: 60,         // 1 minute
  threadDetail: 300,      // 5 minutes
  threadHot: 30,          // 30 seconds for popular threads
  postList: 300,          // 5 minutes
  postReactions: 60,      // 1 minute
};
```

### 5.3 Cache Invalidation Strategy

```typescript
// Invalidation patterns
const invalidateOnThreadCreate = async (categorySlug: string) => {
  await redis.del(CACHE_KEYS.categories);
  await redis.del(`${CACHE_KEYS.threadList(categorySlug, 1, 'latest')}*`);
};

const invalidateOnPostCreate = async (threadId: string) => {
  await redis.del(CACHE_KEYS.threadDetail(threadId));
  await redis.del(`${CACHE_KEYS.postList(threadId, '*')}*`);
};

const invalidateOnReaction = async (postId: string) => {
  await redis.del(CACHE_KEYS.postReactions(postId));
};
```

### 5.4 View Count Batching

To avoid write amplification on every page view:

```typescript
class ViewCountBatcher {
  private buffer: Map<string, number> = new Map();
  private flushInterval = 60000; // 1 minute

  async recordView(threadId: string): Promise<void> {
    // Increment in Redis counter (fast)
    await redis.incr(CACHE_KEYS.threadViews(threadId));

    // Add to batch buffer
    const current = this.buffer.get(threadId) || 0;
    this.buffer.set(threadId, current + 1);
  }

  async flush(): Promise<void> {
    const updates = Array.from(this.buffer.entries());

    // Batch update database
    await prisma.$transaction(
      updates.map(([threadId, increment]) =>
        prisma.forumThread.update({
          where: { id: threadId },
          data: { viewCount: { increment } },
        })
      )
    );

    this.buffer.clear();
  }
}
```

---

## 6. Real-time Updates

### 6.1 WebSocket Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REAL-TIME UPDATE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client A (Viewing Thread)      Server           Client B (Posting)         │
│        │                          │                     │                    │
│        │   join:thread:123       │                     │                    │
│        │─────────────────────────▶│                     │                    │
│        │                          │                     │                    │
│        │                          │   POST /posts       │                    │
│        │                          │◀────────────────────│                    │
│        │                          │                     │                    │
│        │                          │  (Save to DB)       │                    │
│        │                          │  (Invalidate cache) │                    │
│        │                          │                     │                    │
│        │   forum:new_post        │                     │                    │
│        │◀─────────────────────────│                     │                    │
│        │                          │                     │                    │
│        │  (Update UI instantly)  │                     │                    │
│        │                          │                     │                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Socket Events

```typescript
// Client events (client -> server)
type ClientEvents = {
  'forum:join_thread': { threadId: string };
  'forum:leave_thread': { threadId: string };
  'forum:join_category': { categorySlug: string };
  'forum:leave_category': { categorySlug: string };
  'forum:typing': { threadId: string; isTyping: boolean };
};

// Server events (server -> client)
type ServerEvents = {
  'forum:new_post': {
    threadId: string;
    post: {
      id: string;
      content: string;
      author: UserSummary;
      createdAt: string;
    };
  };
  'forum:post_updated': {
    postId: string;
    content: string;
    updatedAt: string;
  };
  'forum:post_deleted': {
    postId: string;
    threadId: string;
  };
  'forum:thread_updated': {
    threadId: string;
    isPinned?: boolean;
    isLocked?: boolean;
  };
  'forum:reaction_updated': {
    postId: string;
    reactions: ReactionCount[];
  };
  'forum:user_typing': {
    threadId: string;
    user: UserSummary;
    isTyping: boolean;
  };
};
```

### 6.3 Room Management

```typescript
class ForumSocketManager {
  // Room patterns
  private getThreadRoom = (threadId: string) => `forum:thread:${threadId}`;
  private getCategoryRoom = (slug: string) => `forum:category:${slug}`;

  async handleConnection(socket: Socket) {
    socket.on('forum:join_thread', ({ threadId }) => {
      socket.join(this.getThreadRoom(threadId));
    });

    socket.on('forum:leave_thread', ({ threadId }) => {
      socket.leave(this.getThreadRoom(threadId));
    });
  }

  // Called after database operations
  async broadcastNewPost(threadId: string, post: ForumPost) {
    io.to(this.getThreadRoom(threadId)).emit('forum:new_post', {
      threadId,
      post: formatPostForBroadcast(post),
    });
  }
}
```

### 6.4 Optimistic Updates

Frontend implements optimistic updates for better UX:

```typescript
// Example: React hook for posting
function useCreatePost(threadId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => api.createPost(threadId, content),

    // Optimistic update
    onMutate: async (content) => {
      await queryClient.cancelQueries(['thread', threadId, 'posts']);

      const previousPosts = queryClient.getQueryData(['thread', threadId, 'posts']);

      // Optimistically add the new post
      queryClient.setQueryData(['thread', threadId, 'posts'], (old) => ({
        ...old,
        data: [...old.data, {
          id: 'temp-' + Date.now(),
          content,
          author: currentUser,
          createdAt: new Date().toISOString(),
          isPending: true,
        }],
      }));

      return { previousPosts };
    },

    // Rollback on error
    onError: (err, content, context) => {
      queryClient.setQueryData(
        ['thread', threadId, 'posts'],
        context.previousPosts
      );
    },

    // Refetch after success
    onSettled: () => {
      queryClient.invalidateQueries(['thread', threadId, 'posts']);
    },
  });
}
```

---

## 7. Search & Discovery

### 7.1 Search Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEARCH ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Option A: PostgreSQL Full-Text Search (MVP)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  ForumThread                     ForumPost                            │  │
│  │  ├── title (tsvector)            ├── content (tsvector)               │  │
│  │  └── content (tsvector)          └── GIN index                        │  │
│  │                                                                        │  │
│  │  Combined search across threads and posts with ranking                 │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Option B: Elasticsearch (Scale)                                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  forum_threads index             forum_posts index                    │  │
│  │  ├── title (text)                ├── content (text)                   │  │
│  │  ├── content (text)              ├── threadId (keyword)               │  │
│  │  ├── category (keyword)          └── authorId (keyword)               │  │
│  │  └── tags (keyword[])                                                 │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 PostgreSQL Full-Text Search Implementation

```sql
-- Add search vectors
ALTER TABLE forum_threads ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

ALTER TABLE forum_posts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED;

-- Create GIN indexes
CREATE INDEX forum_threads_search_idx ON forum_threads USING GIN(search_vector);
CREATE INDEX forum_posts_search_idx ON forum_posts USING GIN(search_vector);
```

```typescript
// Search query
async function searchForum(query: string, options: SearchOptions) {
  const searchQuery = query.split(' ').join(' & ');

  const results = await prisma.$queryRaw`
    SELECT
      'thread' as type,
      t.id,
      t.title,
      t.content,
      ts_rank(t.search_vector, plainto_tsquery(${searchQuery})) as rank
    FROM forum_threads t
    WHERE t.search_vector @@ plainto_tsquery(${searchQuery})

    UNION ALL

    SELECT
      'post' as type,
      p.id,
      NULL as title,
      p.content,
      ts_rank(p.search_vector, plainto_tsquery(${searchQuery})) as rank
    FROM forum_posts p
    WHERE p.search_vector @@ plainto_tsquery(${searchQuery})

    ORDER BY rank DESC
    LIMIT ${options.limit}
    OFFSET ${options.offset}
  `;

  return results;
}
```

### 7.3 Discovery Features

```typescript
interface DiscoveryEndpoints {
  // Trending threads (high activity in last 24h)
  'GET /api/forums/trending': {
    response: ThreadSummary[];
    caching: '5 minutes';
  };

  // Recent activity (newest posts across all threads)
  'GET /api/forums/recent': {
    response: {
      thread: ThreadSummary;
      latestPost: PostSummary;
    }[];
    caching: '1 minute';
  };

  // User's threads and followed threads
  'GET /api/forums/my-threads': {
    response: ThreadSummary[];
    auth: 'required';
  };
}
```

---

## 8. Security Considerations

### 8.1 Input Validation

```typescript
// Sanitization for user-generated content
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

function sanitizeContent(rawContent: string): string {
  // Convert markdown to HTML
  const html = marked.parse(rawContent);

  // Sanitize HTML
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
  });
}

// Link safety
function sanitizeLinks(content: string): string {
  return content.replace(
    /<a\s+href="([^"]+)"/g,
    (match, url) => {
      const safeUrl = url.startsWith('http') ? url : '#';
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow"`;
    }
  );
}
```

### 8.2 Rate Limiting

```typescript
const forumRateLimits = {
  // Thread creation
  createThread: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,                   // 10 threads per hour
    message: 'Too many threads created. Please wait before creating more.',
  },

  // Post creation
  createPost: {
    windowMs: 60 * 1000,       // 1 minute
    max: 5,                    // 5 posts per minute
    message: 'You are posting too quickly. Please slow down.',
  },

  // Reactions
  createReaction: {
    windowMs: 60 * 1000,       // 1 minute
    max: 30,                   // 30 reactions per minute
    message: 'Too many reactions. Please slow down.',
  },

  // Search
  search: {
    windowMs: 60 * 1000,       // 1 minute
    max: 20,                   // 20 searches per minute
    message: 'Too many search requests.',
  },
};
```

### 8.3 Authorization Checks

```typescript
// Middleware for forum operations
async function checkForumPermission(
  userId: string,
  action: ForumAction,
  resourceId: string
): Promise<boolean> {
  const user = await getUser(userId);

  // Admin/Moderator can do anything
  if (['ADMIN', 'MODERATOR'].includes(user.role)) {
    return true;
  }

  switch (action) {
    case 'edit_thread':
    case 'delete_thread': {
      const thread = await getThread(resourceId);
      return thread.authorId === userId;
    }

    case 'edit_post':
    case 'delete_post': {
      const post = await getPost(resourceId);
      return post.authorId === userId;
    }

    case 'create_post': {
      const thread = await getThread(resourceId);
      return !thread.isLocked;
    }

    case 'pin_thread':
    case 'lock_thread':
      return false; // Only mods/admins

    default:
      return true; // Read operations
  }
}
```

### 8.4 Spam Prevention

```typescript
interface SpamPrevention {
  // Duplicate detection
  checkDuplicateContent: (content: string, userId: string) => Promise<boolean>;

  // Honeypot fields
  validateHoneypot: (formData: FormData) => boolean;

  // Time-based checks
  checkPostingSpeed: (userId: string) => Promise<boolean>;

  // Content analysis
  checkContentQuality: (content: string) => Promise<ContentQualityResult>;
}

async function checkContentQuality(content: string): Promise<ContentQualityResult> {
  const flags = [];

  // Too short
  if (content.length < 10) {
    flags.push('content_too_short');
  }

  // All caps
  if (content === content.toUpperCase() && content.length > 20) {
    flags.push('excessive_caps');
  }

  // Excessive links
  const linkCount = (content.match(/https?:\/\//g) || []).length;
  if (linkCount > 5) {
    flags.push('excessive_links');
  }

  // Repeated characters
  if (/(.)\1{10,}/.test(content)) {
    flags.push('repeated_characters');
  }

  return {
    isSpam: flags.length >= 2,
    flags,
    requiresReview: flags.length > 0,
  };
}
```

---

## 9. Performance Optimization

### 9.1 Database Optimization

```sql
-- Composite indexes for common queries
CREATE INDEX idx_threads_category_pinned_created
  ON forum_threads(category_id, is_pinned DESC, created_at DESC);

CREATE INDEX idx_threads_category_last_reply
  ON forum_threads(category_id, last_reply_at DESC NULLS LAST);

CREATE INDEX idx_posts_thread_created
  ON forum_posts(thread_id, created_at ASC);

-- Partial indexes
CREATE INDEX idx_pinned_threads
  ON forum_threads(category_id, created_at DESC)
  WHERE is_pinned = true;

CREATE INDEX idx_active_threads
  ON forum_threads(category_id, last_reply_at DESC)
  WHERE is_locked = false;
```

### 9.2 Query Optimization

```typescript
// Efficient thread listing with cursor-based pagination
async function getThreads(
  categoryId: string,
  cursor: string | null,
  limit: number = 20
) {
  const threads = await prisma.forumThread.findMany({
    where: {
      categoryId,
      ...(cursor && {
        OR: [
          { isPinned: false, createdAt: { lt: new Date(cursor) } },
          { isPinned: true }, // Always include pinned
        ],
      }),
    },
    orderBy: [
      { isPinned: 'desc' },
      { createdAt: 'desc' },
    ],
    take: limit + 1, // Fetch one extra for cursor
    include: {
      author: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      lastReplyBy: {
        select: { id: true, username: true },
      },
    },
  });

  const hasMore = threads.length > limit;
  const data = hasMore ? threads.slice(0, -1) : threads;
  const nextCursor = hasMore ? data[data.length - 1].createdAt.toISOString() : null;

  return { data, nextCursor, hasMore };
}
```

### 9.3 Frontend Optimization

```typescript
// Infinite scroll with React Query
function useThreadList(categorySlug: string) {
  return useInfiniteQuery({
    queryKey: ['threads', categorySlug],
    queryFn: ({ pageParam }) =>
      api.getThreads(categorySlug, { cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 60000, // 1 minute
    cacheTime: 300000, // 5 minutes
  });
}

// Virtual scrolling for long thread lists
function ThreadList({ threads }: { threads: Thread[] }) {
  return (
    <VirtualList
      height={600}
      itemCount={threads.length}
      itemSize={80}
      renderItem={({ index, style }) => (
        <ThreadRow
          key={threads[index].id}
          thread={threads[index]}
          style={style}
        />
      )}
    />
  );
}
```

### 9.4 Connection Pooling

```typescript
// PrismaClient with connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool settings
  log: ['query', 'error', 'warn'],
});

// For high-traffic endpoints, use read replicas
const prismaReplica = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_REPLICA_URL,
    },
  },
});
```

---

## 10. Future Enhancements

### 10.1 Roadmap

| Phase | Feature | Priority | Complexity |
|-------|---------|----------|------------|
| 1.1 | Thread subscriptions/notifications | High | Medium |
| 1.1 | User mentions (@username) | High | Low |
| 1.2 | Thread tagging system | Medium | Medium |
| 1.2 | Rich text editor (WYSIWYG) | Medium | Medium |
| 2.0 | Thread polls | Medium | Medium |
| 2.0 | File attachments/images | Medium | High |
| 2.0 | Private messaging | Low | High |
| 3.0 | Reputation/karma system | Low | Medium |
| 3.0 | Badges/achievements | Low | Medium |

### 10.2 Notification System

```typescript
interface ForumNotification {
  id: string;
  userId: string;
  type: NotificationType;
  data: {
    threadId?: string;
    postId?: string;
    mentionedBy?: string;
  };
  isRead: boolean;
  createdAt: Date;
}

type NotificationType =
  | 'reply_to_thread'      // Someone replied to your thread
  | 'reply_to_post'        // Someone replied to your post
  | 'mention'              // You were mentioned
  | 'thread_pinned'        // Your thread was pinned
  | 'thread_locked';       // Your thread was locked
```

### 10.3 Analytics Dashboard

```typescript
interface ForumAnalytics {
  overview: {
    totalThreads: number;
    totalPosts: number;
    totalUsers: number;
    activeUsersToday: number;
  };
  activity: {
    threadsPerDay: DataPoint[];
    postsPerDay: DataPoint[];
    activeUsersPerDay: DataPoint[];
  };
  engagement: {
    avgRepliesPerThread: number;
    avgTimeToFirstReply: number;
    topContributors: UserSummary[];
    topThreads: ThreadSummary[];
  };
  moderation: {
    flaggedContent: number;
    actionsToday: number;
    spamBlocked: number;
  };
}
```

---

## Appendix A: API Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `THREAD_NOT_FOUND` | 404 | Thread does not exist |
| `POST_NOT_FOUND` | 404 | Post does not exist |
| `CATEGORY_NOT_FOUND` | 404 | Category does not exist |
| `THREAD_LOCKED` | 403 | Cannot post to locked thread |
| `PERMISSION_DENIED` | 403 | User lacks permission |
| `RATE_LIMITED` | 429 | Too many requests |
| `CONTENT_FLAGGED` | 422 | Content failed moderation |
| `DUPLICATE_CONTENT` | 409 | Similar content exists |

---

## Appendix B: Default Categories

```typescript
const DEFAULT_CATEGORIES = [
  {
    name: 'Announcements',
    slug: 'announcements',
    description: 'Official updates and news from the Bostonia team',
    icon: '📢',
    sortOrder: 0,
  },
  {
    name: 'General Discussion',
    slug: 'general',
    description: 'Chat about anything related to Bostonia',
    icon: '💬',
    sortOrder: 1,
  },
  {
    name: 'Character Creation',
    slug: 'character-creation',
    description: 'Tips, tutorials, and discussions about creating characters',
    icon: '🎨',
    sortOrder: 2,
  },
  {
    name: 'Character Showcase',
    slug: 'showcase',
    description: 'Share your characters and get feedback',
    icon: '⭐',
    sortOrder: 3,
  },
  {
    name: 'Feature Requests',
    slug: 'feature-requests',
    description: 'Suggest new features and improvements',
    icon: '💡',
    sortOrder: 4,
  },
  {
    name: 'Help & Support',
    slug: 'help',
    description: 'Get help from the community',
    icon: '❓',
    sortOrder: 5,
  },
  {
    name: 'Bug Reports',
    slug: 'bugs',
    description: 'Report issues and bugs',
    icon: '🐛',
    sortOrder: 6,
  },
];
```

---

*Document Version: 1.0*
*Last Updated: January 29, 2026*
*Author: System Architecture Team*
