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
        _count: { select: { characters: true } },
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

app.listen(PORT, () => {
  logger.info(`User service listening on port ${PORT}`);
});
