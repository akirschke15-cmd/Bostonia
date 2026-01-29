// User types
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: UserRole;
  status: UserStatus;
  credits: number;
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: Date | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'user' | 'creator' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'deleted';
export type SubscriptionTier = 'free' | 'basic' | 'premium' | 'unlimited';

export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  defaultChatMode: ChatMode;
  contentFilter: ContentFilterLevel;
  autoSaveConversations: boolean;
}

// Character types
export interface Character {
  id: string;
  creatorId: string;
  name: string;
  tagline: string;
  description: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  personality: CharacterPersonality;
  visibility: CharacterVisibility;
  category: string;
  tags: string[];
  rating: number;
  ratingCount: number;
  chatCount: number;
  messageCount: number;
  isFeatured: boolean;
  isNsfw: boolean;
  status: CharacterStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterPersonality {
  systemPrompt: string;
  greeting: string;
  exampleDialogues: ExampleDialogue[];
  traits: string[];
  background: string;
  voice: VoiceStyle;
  responseLength: ResponseLength;
}

export interface ExampleDialogue {
  userMessage: string;
  characterMessage: string;
}

export type VoiceStyle = 'formal' | 'casual' | 'playful' | 'serious' | 'poetic' | 'technical';
export type ResponseLength = 'short' | 'medium' | 'long' | 'variable';
export type CharacterVisibility = 'public' | 'unlisted' | 'private';
export type CharacterStatus = 'draft' | 'published' | 'archived' | 'banned';

// Conversation types
export interface Conversation {
  id: string;
  userId: string;
  characterId: string;
  title: string;
  mode: ChatMode;
  status: ConversationStatus;
  messageCount: number;
  lastMessageAt: Date | null;
  parentConversationId: string | null;
  branchPointMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatMode = 'standard' | 'roleplay' | 'adventure' | 'creative';
export type ConversationStatus = 'active' | 'archived' | 'deleted';

// Message types
export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  tokenCount: number;
  isEdited: boolean;
  isRegenerated: boolean;
  parentMessageId: string | null;
  metadata: MessageMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface MessageMetadata {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  moderationFlags?: string[];
}

// Memory types
export interface MemoryEntry {
  id: string;
  conversationId: string;
  type: MemoryType;
  content: string;
  importance: number;
  embedding: number[] | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export type MemoryType = 'fact' | 'preference' | 'event' | 'relationship' | 'summary';

// Payment types
export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing';

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number;
  balance: number;
  description: string;
  referenceId: string | null;
  createdAt: Date;
}

export type CreditTransactionType = 'purchase' | 'usage' | 'refund' | 'bonus' | 'subscription';

// API types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Content moderation types
export type ContentFilterLevel = 'strict' | 'moderate' | 'relaxed';

export interface ModerationResult {
  passed: boolean;
  flags: ModerationFlag[];
  score: number;
}

export interface ModerationFlag {
  category: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// WebSocket event types
export interface WsMessage<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: number;
}

export type WsEventType =
  | 'chat:message'
  | 'chat:typing'
  | 'chat:stream_start'
  | 'chat:stream_chunk'
  | 'chat:stream_end'
  | 'chat:error'
  | 'connection:ping'
  | 'connection:pong';

export interface ChatStreamChunk {
  conversationId: string;
  messageId: string;
  content: string;
  isComplete: boolean;
}

export interface TypingIndicator {
  conversationId: string;
  isTyping: boolean;
}
