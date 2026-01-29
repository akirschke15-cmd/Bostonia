import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { prisma } from '@bostonia/database';
import {
  successResponse,
  errorResponse,
  ErrorCodes,
  getEnv,
  updateUserSchema,
  userPreferencesSchema,
  calculatePagination,
} from '@bostonia/shared';

const logger = pino({ level: getEnv('LOG_LEVEL', 'info') });
const PORT = parseInt(getEnv('PORT', '3002'), 10);

const app = express();

app.use(helmet());
app.use(cors({ origin: getEnv('FRONTEND_URL', 'http://localhost:3000'), credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'healthy', service: 'user-service' }));
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            characters: true,
            followers: true,
            following: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    res.json(successResponse(user));
  } catch (error) {
    logger.error(error, 'Error fetching user');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch user'));
  }
});

// Update user profile (requires auth - simplified for scaffold)
app.patch('/api/users/:id', async (req, res) => {
  try {
    const data = updateUserSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        updatedAt: true,
      },
    });

    res.json(successResponse(user));
  } catch (error) {
    logger.error(error, 'Error updating user');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update user'));
  }
});

// Get user preferences
app.get('/api/users/:id/preferences', async (req, res) => {
  try {
    const preferences = await prisma.userPreferences.findUnique({
      where: { userId: req.params.id },
    });

    if (!preferences) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Preferences not found'));
    }

    res.json(successResponse(preferences));
  } catch (error) {
    logger.error(error, 'Error fetching preferences');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch preferences'));
  }
});

// Update user preferences
app.patch('/api/users/:id/preferences', async (req, res) => {
  try {
    const data = userPreferencesSchema.parse(req.body);

    // Transform lowercase enum values to uppercase for Prisma
    const prismaData: Record<string, unknown> = {};
    if (data.theme) prismaData['theme'] = data.theme.toUpperCase();
    if (data.language) prismaData['language'] = data.language;
    if (data.notificationsEnabled !== undefined) prismaData['notificationsEnabled'] = data.notificationsEnabled;
    if (data.emailNotifications !== undefined) prismaData['emailNotifications'] = data.emailNotifications;
    if (data.defaultChatMode) prismaData['defaultChatMode'] = data.defaultChatMode.toUpperCase();
    if (data.contentFilter) prismaData['contentFilter'] = data.contentFilter.toUpperCase();
    if (data.autoSaveConversations !== undefined) prismaData['autoSaveConversations'] = data.autoSaveConversations;

    const preferences = await prisma.userPreferences.upsert({
      where: { userId: req.params.id },
      update: prismaData,
      create: { userId: req.params.id, ...prismaData },
    });

    res.json(successResponse(preferences));
  } catch (error) {
    logger.error(error, 'Error updating preferences');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update preferences'));
  }
});

// Get user's favorites
app.get('/api/users/:id/favorites', async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId: req.params.id },
        include: {
          character: {
            select: {
              id: true,
              name: true,
              tagline: true,
              avatarUrl: true,
              category: true,
              rating: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.favorite.count({ where: { userId: req.params.id } }),
    ]);

    res.json(successResponse(
      favorites.map(f => f.character),
      calculatePagination(page, limit, total)
    ));
  } catch (error) {
    logger.error(error, 'Error fetching favorites');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch favorites'));
  }
});

// Get user credits
app.get('/api/users/:id/credits', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { credits: true, subscriptionTier: true },
    });

    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    res.json(successResponse(user));
  } catch (error) {
    logger.error(error, 'Error fetching credits');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch credits'));
  }
});

// Get credit transactions
app.get('/api/users/:id/credits/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;

    const [transactions, total] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: { userId: req.params.id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.creditTransaction.count({ where: { userId: req.params.id } }),
    ]);

    res.json(successResponse(transactions, calculatePagination(page, limit, total)));
  } catch (error) {
    logger.error(error, 'Error fetching transactions');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch transactions'));
  }
});

// ============================================================================
// FOLLOW ENDPOINTS (Week 12 - Creator Following System)
// ============================================================================

// Follow a user
app.post('/api/users/:id/follow', async (req, res) => {
  try {
    // Get current user ID from auth header (simplified - in production use proper auth middleware)
    const currentUserId = req.headers['x-user-id'] as string;
    if (!currentUserId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required'));
    }

    const targetUserId = req.params.id;

    // Prevent self-follow
    if (currentUserId === targetUserId) {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'Cannot follow yourself'));
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      return res.status(409).json(errorResponse(ErrorCodes.ALREADY_EXISTS, 'Already following this user'));
    }

    // Create follow relationship
    const follow = await prisma.follow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json(successResponse({
      id: follow.id,
      following: follow.following,
      createdAt: follow.createdAt,
    }));
  } catch (error) {
    logger.error(error, 'Error following user');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to follow user'));
  }
});

// Unfollow a user
app.delete('/api/users/:id/follow', async (req, res) => {
  try {
    const currentUserId = req.headers['x-user-id'] as string;
    if (!currentUserId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required'));
    }

    const targetUserId = req.params.id;

    // Check if follow relationship exists
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (!existingFollow) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Not following this user'));
    }

    // Delete follow relationship
    await prisma.follow.delete({
      where: { id: existingFollow.id },
    });

    res.json(successResponse({ unfollowed: true, userId: targetUserId }));
  } catch (error) {
    logger.error(error, 'Error unfollowing user');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to unfollow user'));
  }
});

// Get user's followers (paginated)
app.get('/api/users/:id/followers', async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;
    const userId = req.params.id;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              role: true,
              _count: { select: { characters: true, followers: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);

    res.json(successResponse(
      followers.map(f => ({
        ...f.follower,
        followedAt: f.createdAt,
      })),
      calculatePagination(page, limit, total)
    ));
  } catch (error) {
    logger.error(error, 'Error fetching followers');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch followers'));
  }
});

// Get who user follows (paginated)
app.get('/api/users/:id/following', async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;
    const userId = req.params.id;

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              role: true,
              _count: { select: { characters: true, followers: true } },
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    res.json(successResponse(
      following.map(f => ({
        ...f.following,
        followedAt: f.createdAt,
      })),
      calculatePagination(page, limit, total)
    ));
  } catch (error) {
    logger.error(error, 'Error fetching following');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch following'));
  }
});

// Check if current user follows target user
app.get('/api/users/:id/follow-status', async (req, res) => {
  try {
    const currentUserId = req.headers['x-user-id'] as string;
    if (!currentUserId) {
      // Return not following if not authenticated
      return res.json(successResponse({ isFollowing: false }));
    }

    const targetUserId = req.params.id;

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        _count: { select: { followers: true, following: true } },
      },
    });

    if (!targetUser) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'User not found'));
    }

    // Check if following
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    res.json(successResponse({
      isFollowing: !!follow,
      followedAt: follow?.createdAt || null,
      followerCount: targetUser._count.followers,
      followingCount: targetUser._count.following,
    }));
  } catch (error) {
    logger.error(error, 'Error checking follow status');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to check follow status'));
  }
});

app.listen(PORT, () => {
  logger.info(`User service listening on port ${PORT}`);
});
