import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import { Prisma, prisma } from '@bostonia/database';
import {
  successResponse,
  errorResponse,
  ErrorCodes,
  getEnv,
  createCharacterSchema,
  updateCharacterSchema,
  searchCharactersSchema,
  rateCharacterSchema,
  calculatePagination,
} from '@bostonia/shared';

const logger = pino({ level: getEnv('LOG_LEVEL', 'info') });
const PORT = parseInt(getEnv('PORT', '3003'), 10);

const app = express();

app.use(helmet());
app.use(cors({ origin: getEnv('FRONTEND_URL', 'http://localhost:3000'), credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'healthy', service: 'character-service' }));
});

// Search/list characters
app.get('/api/characters', async (req, res) => {
  try {
    const params = searchCharactersSchema.parse(req.query);
    const { page, limit, sortBy, sortOrder, query, category, tags, creatorId, visibility, isNsfw, isFeatured, minRating } = params;

    const where: Prisma.CharacterWhereInput = {
      status: 'PUBLISHED',
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { tagline: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(category && { category }),
      ...(tags && tags.length > 0 && { tags: { hasSome: tags } }),
      ...(creatorId && { creatorId }),
      ...(visibility && { visibility: visibility.toUpperCase() as Prisma.EnumCharacterVisibilityFilter<'Character'> }),
      ...(isNsfw !== undefined && { isNsfw }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(minRating !== undefined && { rating: { gte: minRating } }),
    };

    const orderBy: Prisma.CharacterOrderByWithRelationInput = sortBy
      ? { [sortBy]: sortOrder }
      : { chatCount: 'desc' };

    const [characters, total] = await Promise.all([
      prisma.character.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          tagline: true,
          description: true,
          avatarUrl: true,
          category: true,
          tags: true,
          rating: true,
          ratingCount: true,
          chatCount: true,
          isFeatured: true,
          isNsfw: true,
          createdAt: true,
          creator: {
            select: { id: true, username: true, displayName: true },
          },
        },
      }),
      prisma.character.count({ where }),
    ]);

    res.json(successResponse(characters, calculatePagination(page, limit, total)));
  } catch (error) {
    logger.error(error, 'Error searching characters');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to search characters'));
  }
});

// Get featured characters
app.get('/api/characters/featured', async (_req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: { isFeatured: true, status: 'PUBLISHED' },
      take: 12,
      orderBy: { chatCount: 'desc' },
      select: {
        id: true,
        name: true,
        tagline: true,
        avatarUrl: true,
        category: true,
        rating: true,
        chatCount: true,
      },
    });

    res.json(successResponse(characters));
  } catch (error) {
    logger.error(error, 'Error fetching featured characters');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch featured'));
  }
});

// Get character by ID
app.get('/api/characters/:id', async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: req.params.id },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        parentCharacter: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            creator: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    if (!character) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Character not found'));
    }

    res.json(successResponse(character));
  } catch (error) {
    logger.error(error, 'Error fetching character');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch character'));
  }
});

// Create character
app.post('/api/characters', async (req, res) => {
  try {
    // Note: In production, get creatorId from auth token
    const creatorId = req.headers['x-user-id'] as string;
    if (!creatorId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const data = createCharacterSchema.parse(req.body);

    const character = await prisma.character.create({
      data: {
        creatorId,
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        avatarUrl: data.avatarUrl,
        bannerUrl: data.bannerUrl,
        systemPrompt: data.personality.systemPrompt,
        greeting: data.personality.greeting,
        exampleDialogues: data.personality.exampleDialogues,
        traits: data.personality.traits,
        background: data.personality.background,
        voice: data.personality.voice.toUpperCase() as any,
        responseLength: data.personality.responseLength.toUpperCase() as any,
        visibility: data.visibility.toUpperCase() as any,
        category: data.category,
        tags: data.tags,
        isNsfw: data.isNsfw,
      },
    });

    res.status(201).json(successResponse(character));
  } catch (error) {
    logger.error(error, 'Error creating character');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create character'));
  }
});

// Update character
app.patch('/api/characters/:id', async (req, res) => {
  try {
    const data = updateCharacterSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.personality) {
      updateData.systemPrompt = data.personality.systemPrompt;
      updateData.greeting = data.personality.greeting;
      updateData.exampleDialogues = data.personality.exampleDialogues;
      updateData.traits = data.personality.traits;
      updateData.background = data.personality.background;
      updateData.voice = data.personality.voice?.toUpperCase();
      updateData.responseLength = data.personality.responseLength?.toUpperCase();
      delete updateData.personality;
    }
    if (data.visibility) updateData.visibility = data.visibility.toUpperCase();

    const character = await prisma.character.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(successResponse(character));
  } catch (error) {
    logger.error(error, 'Error updating character');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update character'));
  }
});

// Delete character
app.delete('/api/characters/:id', async (req, res) => {
  try {
    await prisma.character.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED' },
    });

    res.json(successResponse({ message: 'Character deleted' }));
  } catch (error) {
    logger.error(error, 'Error deleting character');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete character'));
  }
});

// Rate character
app.post('/api/characters/:id/rate', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const { rating } = rateCharacterSchema.parse(req.body);

    // Upsert rating
    await prisma.characterRating.upsert({
      where: { userId_characterId: { userId, characterId: req.params.id } },
      update: { rating },
      create: { userId, characterId: req.params.id, rating },
    });

    // Recalculate average
    const stats = await prisma.characterRating.aggregate({
      where: { characterId: req.params.id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.character.update({
      where: { id: req.params.id },
      data: {
        rating: stats._avg.rating || 0,
        ratingCount: stats._count.rating,
      },
    });

    res.json(successResponse({ rating: stats._avg.rating, count: stats._count.rating }));
  } catch (error) {
    logger.error(error, 'Error rating character');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to rate character'));
  }
});

// Favorite/unfavorite character
app.post('/api/characters/:id/favorite', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_characterId: { userId, characterId: req.params.id } },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      res.json(successResponse({ favorited: false }));
    } else {
      await prisma.favorite.create({
        data: { userId, characterId: req.params.id },
      });
      res.json(successResponse({ favorited: true }));
    }
  } catch (error) {
    logger.error(error, 'Error toggling favorite');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to toggle favorite'));
  }
});

// Get categories
app.get('/api/characters/meta/categories', async (_req, res) => {
  try {
    const categories = await prisma.character.groupBy({
      by: ['category'],
      where: { status: 'PUBLISHED' },
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    res.json(successResponse(categories.map(c => ({
      name: c.category,
      count: c._count.category,
    }))));
  } catch (error) {
    logger.error(error, 'Error fetching categories');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch categories'));
  }
});

// ============================================================================
// CHARACTER REMIX ENDPOINTS (Week 12 Community Feature)
// ============================================================================

// Create a remix (fork) of a character
app.post('/api/characters/:id/remix', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const parentId = req.params.id;

    // Fetch the parent character
    const parentCharacter = await prisma.character.findUnique({
      where: { id: parentId },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!parentCharacter) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Parent character not found'));
    }

    // Check if remixing is allowed
    if (!parentCharacter.allowRemix) {
      return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'This character does not allow remixing'));
    }

    // Check if character is public or unlisted (can't remix private characters unless you're the owner)
    if (parentCharacter.visibility === 'PRIVATE' && parentCharacter.creatorId !== userId) {
      return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'Cannot remix a private character'));
    }

    // Get optional customizations from request body
    const { name, tagline, description } = req.body || {};

    // Create the remix - copy most fields from parent
    const remixedCharacter = await prisma.character.create({
      data: {
        creatorId: userId,
        parentCharacterId: parentId,
        isRemix: true,
        name: name || `${parentCharacter.name} (Remix)`,
        tagline: tagline || parentCharacter.tagline,
        description: description || parentCharacter.description,
        avatarUrl: parentCharacter.avatarUrl,
        bannerUrl: parentCharacter.bannerUrl,
        systemPrompt: parentCharacter.systemPrompt,
        greeting: parentCharacter.greeting,
        exampleDialogues: parentCharacter.exampleDialogues ?? undefined,
        traits: parentCharacter.traits ?? undefined,
        background: parentCharacter.background ?? undefined,
        voice: parentCharacter.voice ?? undefined,
        responseLength: parentCharacter.responseLength,
        visibility: 'PRIVATE', // Start as private so creator can customize
        category: parentCharacter.category,
        tags: parentCharacter.tags,
        isNsfw: parentCharacter.isNsfw,
        status: 'DRAFT', // Start as draft
        allowRemix: true, // Allow further remixing by default
      },
      include: {
        creator: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        parentCharacter: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            creator: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    // Increment the parent's remix count
    await prisma.character.update({
      where: { id: parentId },
      data: { remixCount: { increment: 1 } },
    });

    logger.info({ parentId, remixId: remixedCharacter.id, userId }, 'Character remixed');
    res.status(201).json(successResponse(remixedCharacter));
  } catch (error) {
    logger.error(error, 'Error creating remix');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create remix'));
  }
});

// Get all remixes of a character (paginated)
app.get('/api/characters/:id/remixes', async (req, res) => {
  try {
    const parentId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Check if parent character exists
    const parentExists = await prisma.character.findUnique({
      where: { id: parentId },
      select: { id: true, remixCount: true },
    });

    if (!parentExists) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Character not found'));
    }

    const [remixes, total] = await Promise.all([
      prisma.character.findMany({
        where: {
          parentCharacterId: parentId,
          status: 'PUBLISHED', // Only show published remixes
          visibility: { in: ['PUBLIC', 'UNLISTED'] },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          tagline: true,
          avatarUrl: true,
          category: true,
          rating: true,
          chatCount: true,
          remixCount: true,
          createdAt: true,
          creator: {
            select: { id: true, username: true, displayName: true },
          },
        },
      }),
      prisma.character.count({
        where: {
          parentCharacterId: parentId,
          status: 'PUBLISHED',
          visibility: { in: ['PUBLIC', 'UNLISTED'] },
        },
      }),
    ]);

    res.json(successResponse(remixes, calculatePagination(page, limit, total)));
  } catch (error) {
    logger.error(error, 'Error fetching remixes');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch remixes'));
  }
});

// Get remix ancestry chain (parent -> grandparent -> etc.)
app.get('/api/characters/:id/remix-chain', async (req, res) => {
  try {
    const characterId = req.params.id;
    const maxDepth = Math.min(parseInt(req.query.maxDepth as string) || 10, 20);

    // Start with the requested character
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        isRemix: true,
        parentCharacterId: true,
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!character) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Character not found'));
    }

    // Build the ancestry chain
    const chain: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      isRemix: boolean;
      creator: { id: string; username: string; displayName: string | null };
    }> = [];

    let currentParentId = character.parentCharacterId;
    let depth = 0;

    while (currentParentId && depth < maxDepth) {
      const parent = await prisma.character.findUnique({
        where: { id: currentParentId },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          isRemix: true,
          parentCharacterId: true,
          creator: {
            select: { id: true, username: true, displayName: true },
          },
        },
      });

      if (!parent) break;

      chain.push({
        id: parent.id,
        name: parent.name,
        avatarUrl: parent.avatarUrl,
        isRemix: parent.isRemix,
        creator: parent.creator,
      });

      currentParentId = parent.parentCharacterId;
      depth++;
    }

    res.json(successResponse({
      character: {
        id: character.id,
        name: character.name,
        avatarUrl: character.avatarUrl,
        isRemix: character.isRemix,
        creator: character.creator,
      },
      ancestors: chain,
      totalDepth: chain.length,
    }));
  } catch (error) {
    logger.error(error, 'Error fetching remix chain');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch remix chain'));
  }
});

// Update remix settings (allowRemix toggle)
app.patch('/api/characters/:id/remix-settings', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const characterId = req.params.id;
    const { allowRemix } = req.body;

    if (typeof allowRemix !== 'boolean') {
      return res.status(400).json(errorResponse(ErrorCodes.VALIDATION_ERROR, 'allowRemix must be a boolean'));
    }

    // Check ownership
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { creatorId: true },
    });

    if (!character) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Character not found'));
    }

    if (character.creatorId !== userId) {
      return res.status(403).json(errorResponse(ErrorCodes.FORBIDDEN, 'Not authorized to modify this character'));
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: { allowRemix },
      select: { id: true, allowRemix: true },
    });

    res.json(successResponse(updated));
  } catch (error) {
    logger.error(error, 'Error updating remix settings');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update remix settings'));
  }
});

app.listen(PORT, () => {
  logger.info(`Character service listening on port ${PORT}`);
});
