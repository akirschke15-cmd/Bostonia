import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env file
config({ path: resolve(__dirname, '../../../.env') });

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import pino from 'pino';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { prisma, Prisma } from '@bostonia/database';
import {
  successResponse,
  errorResponse,
  ErrorCodes,
  getEnv,
  requireEnv,
  createConversationSchema,
  updateConversationSchema,
  sendMessageSchema,
  calculatePagination,
  estimateTokenCount,
} from '@bostonia/shared';

const logger = pino({ level: getEnv('LOG_LEVEL', 'info') });
const PORT = parseInt(getEnv('PORT', '3004'), 10);
const REDIS_URL = getEnv('REDIS_URL', 'redis://localhost:6379');
const AI_ORCHESTRATION_URL = getEnv('AI_ORCHESTRATION_URL', 'http://localhost:8001');

const app = express();
const httpServer = createServer(app);

// Redis for Socket.IO adapter
const pubClient = new Redis(REDIS_URL);
const subClient = pubClient.duplicate();

const io = new Server(httpServer, {
  cors: {
    origin: getEnv('FRONTEND_URL', 'http://localhost:3000'),
    credentials: true,
  },
  adapter: createAdapter(pubClient, subClient),
});

app.use(helmet());
app.use(cors({ origin: getEnv('FRONTEND_URL', 'http://localhost:3000'), credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// JWT Authentication middleware
const getJwtSecret = () => requireEnv('JWT_SECRET');

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    // Check if x-user-id is already set (for internal service calls)
    if (req.headers['x-user-id']) {
      return next();
    }
    return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
  }

  const token = authHeader.substring(7);

  try {
    const secret = getJwtSecret();
    logger.info({ secretLength: secret.length, secretStart: secret.substring(0, 10) }, 'JWT verification attempt');
    const payload = jwt.verify(token, secret) as TokenPayload;
    req.headers['x-user-id'] = payload.userId;
    next();
  } catch (error: any) {
    logger.error({ error: error.message, name: error.name }, 'JWT verification failed');
    return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Invalid token'));
  }
};

// Apply auth middleware to protected routes (skip for GET single conversation for internal service calls)
app.use('/api/conversations', (req, res, next) => {
  // Allow GET requests for specific conversations without auth (internal service calls)
  if (req.method === 'GET' && req.path.match(/^\/[a-f0-9-]+$/)) {
    return next();
  }
  return authMiddleware(req, res, next);
});

// Health check
app.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'healthy', service: 'chat-service' }));
});

// List conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;
    const characterId = req.query['characterId'] as string;

    const where = {
      userId,
      status: { not: 'DELETED' as const },
      ...(characterId && { characterId }),
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          character: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json(successResponse(conversations, calculatePagination(page, limit, total)));
  } catch (error) {
    logger.error(error, 'Error listing conversations');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list conversations'));
  }
});

// Create conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const data = createConversationSchema.parse(req.body);

    // Verify character exists
    const character = await prisma.character.findUnique({
      where: { id: data.characterId },
    });

    if (!character) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Character not found'));
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        characterId: data.characterId,
        title: data.title || `Chat with ${character.name}`,
        mode: data.mode.toUpperCase() as any,
      },
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true, greeting: true },
        },
      },
    });

    // Create initial greeting message from character
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: character.greeting,
        tokenCount: estimateTokenCount(character.greeting),
      },
    });

    // Update character chat count
    await prisma.character.update({
      where: { id: data.characterId },
      data: { chatCount: { increment: 1 } },
    });

    res.status(201).json(successResponse(conversation));
  } catch (error) {
    logger.error(error, 'Error creating conversation');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create conversation'));
  }
});

// Get conversation by ID
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        character: true,
      },
    });

    if (!conversation) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Conversation not found'));
    }

    res.json(successResponse(conversation));
  } catch (error) {
    logger.error(error, 'Error fetching conversation');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch conversation'));
  }
});

// Update conversation
app.patch('/api/conversations/:id', async (req, res) => {
  try {
    const data = updateConversationSchema.parse(req.body);

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.status && { status: data.status.toUpperCase() as any }),
      },
    });

    res.json(successResponse(conversation));
  } catch (error) {
    logger.error(error, 'Error updating conversation');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update conversation'));
  }
});

// Get messages for conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 50;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: req.params.id },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.message.count({ where: { conversationId: req.params.id } }),
    ]);

    res.json(successResponse(messages, calculatePagination(page, limit, total)));
  } catch (error) {
    logger.error(error, 'Error fetching messages');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch messages'));
  }
});

// Send message (REST fallback - WebSocket preferred)
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json(errorResponse(ErrorCodes.UNAUTHORIZED, 'Not authenticated'));
    }

    const { content } = sendMessageSchema.parse(req.body);

    // Save user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        role: 'USER',
        content,
        tokenCount: estimateTokenCount(content),
      },
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });

    // Call AI orchestration service
    try {
      const aiResponse = await fetch(`${AI_ORCHESTRATION_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: req.params.id,
          message: content,
          user_id: userId,
        }),
      });

      const aiData = await aiResponse.json() as {
        success: boolean;
        data?: { content: string; metadata?: Record<string, unknown> };
        error?: { message: string };
      };

      if (aiData.success && aiData.data) {
        // Save AI response
        const assistantMessage = await prisma.message.create({
          data: {
            conversationId: req.params.id,
            role: 'ASSISTANT',
            content: aiData.data.content,
            tokenCount: estimateTokenCount(aiData.data.content),
            metadata: aiData.data.metadata as Prisma.InputJsonValue,
          },
        });

        await prisma.conversation.update({
          where: { id: req.params.id },
          data: { messageCount: { increment: 1 } },
        });

        res.json(successResponse({
          userMessage,
          assistantMessage,
        }));
      } else {
        throw new Error(aiData.error?.message || 'AI service error');
      }
    } catch (aiError) {
      logger.error(aiError, 'AI orchestration error');
      res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'AI service unavailable'));
    }
  } catch (error) {
    logger.error(error, 'Error sending message');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to send message'));
  }
});

// Export conversation
app.get('/api/conversations/:id/export', async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        character: { select: { name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      return res.status(404).json(errorResponse(ErrorCodes.NOT_FOUND, 'Conversation not found'));
    }

    const format = req.query['format'] || 'json';

    if (format === 'txt') {
      const text = conversation.messages
        .map(m => `[${m.role}]: ${m.content}`)
        .join('\n\n');

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${conversation.id}.txt"`);
      return res.send(text);
    }

    res.json(successResponse(conversation));
  } catch (error) {
    logger.error(error, 'Error exporting conversation');
    res.status(500).json(errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to export conversation'));
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  socket.on('join:conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
    logger.info({ socketId: socket.id, conversationId }, 'Joined conversation');
  });

  socket.on('leave:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  socket.on('chat:message', async (data: { conversationId: string; content: string; userId: string }) => {
    try {
      const { conversationId, content, userId } = data;

      // Save user message
      const userMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'USER',
          content,
          tokenCount: estimateTokenCount(content),
        },
      });

      // Broadcast user message
      io.to(`conversation:${conversationId}`).emit('chat:message', {
        type: 'user',
        message: userMessage,
      });

      // Emit typing indicator
      io.to(`conversation:${conversationId}`).emit('chat:typing', { isTyping: true });

      // Call AI service with streaming
      const response = await fetch(`${AI_ORCHESTRATION_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, message: content, user_id: userId }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      // Handle streaming response - parse SSE format
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              const data = JSON.parse(jsonStr);
              if (data.content) {
                fullContent += data.content;
                // Emit parsed content to clients
                io.to(`conversation:${conversationId}`).emit('chat:stream_chunk', {
                  conversationId,
                  content: data.content,
                });
              }
            } catch {
              // Ignore parse errors for non-JSON lines
            }
          }
        }
      }

      // Save complete message
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: fullContent,
          tokenCount: estimateTokenCount(fullContent),
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          messageCount: { increment: 2 },
          lastMessageAt: new Date(),
        },
      });

      // Emit completion
      io.to(`conversation:${conversationId}`).emit('chat:stream_end', {
        message: assistantMessage,
      });
      io.to(`conversation:${conversationId}`).emit('chat:typing', { isTyping: false });

    } catch (error) {
      logger.error(error, 'WebSocket chat error');
      socket.emit('chat:error', { message: 'Failed to process message' });
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Client disconnected');
  });
});

httpServer.listen(PORT, () => {
  logger.info(`Chat service listening on port ${PORT}`);
});
