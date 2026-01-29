import { z } from 'zod';

// Common schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// User schemas
export const userRoleSchema = z.enum(['user', 'creator', 'moderator', 'admin']);
export const userStatusSchema = z.enum(['active', 'suspended', 'deleted']);
export const subscriptionTierSchema = z.enum(['free', 'basic', 'premium', 'unlimited']);

export const registerUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().min(1).max(50).optional(),
});

export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(10).optional(),
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  defaultChatMode: z.enum(['standard', 'roleplay', 'adventure', 'creative']).optional(),
  contentFilter: z.enum(['strict', 'moderate', 'relaxed']).optional(),
  autoSaveConversations: z.boolean().optional(),
});

// Character schemas
export const voiceStyleSchema = z.enum(['formal', 'casual', 'playful', 'serious', 'poetic', 'technical']);
export const responseLengthSchema = z.enum(['short', 'medium', 'long', 'variable']);
export const characterVisibilitySchema = z.enum(['public', 'unlisted', 'private']);
export const characterStatusSchema = z.enum(['draft', 'published', 'archived', 'banned']);

export const exampleDialogueSchema = z.object({
  userMessage: z.string().min(1).max(1000),
  characterMessage: z.string().min(1).max(2000),
});

export const characterPersonalitySchema = z.object({
  systemPrompt: z.string().min(10).max(10000),
  greeting: z.string().min(1).max(2000),
  exampleDialogues: z.array(exampleDialogueSchema).max(10).default([]),
  traits: z.array(z.string().max(50)).max(20).default([]),
  background: z.string().max(5000).default(''),
  voice: voiceStyleSchema.default('casual'),
  responseLength: responseLengthSchema.default('medium'),
});

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  tagline: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  avatarUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  personality: characterPersonalitySchema,
  visibility: characterVisibilitySchema.default('private'),
  category: z.string().min(1).max(50),
  tags: z.array(z.string().max(30)).max(10).default([]),
  isNsfw: z.boolean().default(false),
});

export const updateCharacterSchema = createCharacterSchema.partial();

export const searchCharactersSchema = paginationSchema.extend({
  query: z.string().max(200).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  creatorId: z.string().uuid().optional(),
  visibility: characterVisibilitySchema.optional(),
  isNsfw: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  minRating: z.number().min(0).max(5).optional(),
});

export const rateCharacterSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

// Conversation schemas
export const chatModeSchema = z.enum(['standard', 'roleplay', 'adventure', 'creative']);
export const conversationStatusSchema = z.enum(['active', 'archived', 'deleted']);

export const createConversationSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().max(200).optional(),
  mode: chatModeSchema.default('standard'),
});

export const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  status: conversationStatusSchema.optional(),
});

export const branchConversationSchema = z.object({
  messageId: z.string().uuid(),
  title: z.string().max(200).optional(),
});

// Message schemas
export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

export const regenerateMessageSchema = z.object({
  messageId: z.string().uuid(),
});

// Chat WebSocket schemas
export const wsMessageSchema = z.object({
  type: z.enum([
    'chat:message',
    'chat:typing',
    'chat:stream_start',
    'chat:stream_chunk',
    'chat:stream_end',
    'chat:error',
    'connection:ping',
    'connection:pong',
  ]),
  payload: z.unknown(),
  timestamp: z.number(),
});

export const chatMessagePayloadSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(10000),
});

// Payment schemas
export const subscriptionStatusSchema = z.enum(['active', 'past_due', 'canceled', 'incomplete', 'trialing']);
export const creditTransactionTypeSchema = z.enum(['purchase', 'usage', 'refund', 'bonus', 'subscription']);

export const createCheckoutSessionSchema = z.object({
  tier: subscriptionTierSchema.exclude(['free']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

export const purchaseCreditsSchema = z.object({
  amount: z.number().int().positive().max(10000),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

// Content moderation schemas
export const contentFilterLevelSchema = z.enum(['strict', 'moderate', 'relaxed']);

export const moderationFlagSchema = z.object({
  category: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string(),
});

export const moderationResultSchema = z.object({
  passed: z.boolean(),
  flags: z.array(moderationFlagSchema),
  score: z.number().min(0).max(1),
});

// Export type inference helpers
export type PaginationInput = z.infer<typeof paginationSchema>;
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type SearchCharactersInput = z.infer<typeof searchCharactersSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ChatMessagePayload = z.infer<typeof chatMessagePayloadSchema>;
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;
export type PurchaseCreditsInput = z.infer<typeof purchaseCreditsSchema>;
