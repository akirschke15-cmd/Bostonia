# Node.js API Development with TypeScript

## Introduction

This guide covers modern API development patterns using TypeScript with Node.js, focusing on type safety, maintainability, and best practices.

## Express with TypeScript

### Basic Setup

```typescript
// src/app.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

const app: Express = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
```

### Typed Request and Response

```typescript
// src/types/express.ts
import { Request } from 'express';

// Extend Express Request with custom properties
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Type-safe request handlers
export interface TypedRequestBody<T> extends Request {
  body: T;
}

export interface TypedRequestQuery<T> extends Request {
  query: T;
}

export interface TypedRequest<TBody, TQuery> extends Request {
  body: TBody;
  query: TQuery;
}
```

### Structured API Routes

```typescript
// src/routes/users.routes.ts
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';

const router = Router();
const userController = new UserController();

// GET /api/users
router.get('/', authenticate, userController.getAll);

// GET /api/users/:id
router.get('/:id', authenticate, userController.getById);

// POST /api/users
router.post(
  '/',
  validateRequest(createUserSchema),
  userController.create
);

// PATCH /api/users/:id
router.patch(
  '/:id',
  authenticate,
  validateRequest(updateUserSchema),
  userController.update
);

// DELETE /api/users/:id
router.delete('/:id', authenticate, userController.delete);

export default router;
```

### Controllers

```typescript
// src/controllers/user.controller.ts
import { Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';
import { AuthRequest, TypedRequestBody } from '../types/express';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';

export class UserController {
  private userService = new UserService();

  getAll = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await this.userService.findAll({
        page,
        limit,
        search
      });

      res.json({
        data: result.data,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.findById(id);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  create = async (
    req: TypedRequestBody<CreateUserDto>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.userService.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  };

  update = async (
    req: TypedRequestBody<UpdateUserDto>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await this.userService.update(id, req.body);

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  };

  delete = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      await this.userService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
```

### Service Layer

```typescript
// src/services/user.service.ts
import { PrismaClient } from '@prisma/client';
import { CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

export class UserService {
  async findAll(options: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } }
          ]
        }
      : {};

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.user.count({ where })
    ]);

    return { data, total };
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email }
    });
  }

  async create(data: CreateUserDto) {
    const hashedPassword = await hashPassword(data.password);

    return prisma.user.create({
      data: {
        ...data,
        password: hashedPassword
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });
  }

  async update(id: string, data: UpdateUserDto) {
    const updateData: any = { ...data };

    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        updatedAt: true
      }
    });
  }

  async delete(id: string) {
    return prisma.user.delete({
      where: { id }
    });
  }
}
```

## tRPC - Type-Safe APIs

### Setup

```typescript
// src/trpc/init.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';

// Context
export const createContext = ({
  req,
  res
}: CreateExpressContextOptions) => {
  // Get user from JWT token
  const user = getUserFromToken(req.headers.authorization);

  return {
    req,
    res,
    user
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null
      }
    };
  }
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;

// Auth middleware
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      user: ctx.user
    }
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

### Routers

```typescript
// src/trpc/routers/user.router.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../init';
import { UserService } from '../../services/user.service';

const userService = new UserService();

export const userRouter = router({
  // Get all users
  getAll: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(10),
        search: z.string().optional()
      })
    )
    .query(async ({ input }) => {
      return userService.findAll(input);
    }),

  // Get user by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const user = await userService.findById(input.id);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found'
        });
      }

      return user;
    }),

  // Create user
  create: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(2),
        role: z.enum(['admin', 'user']).default('user')
      })
    )
    .mutation(async ({ input }) => {
      // Check if user exists
      const existingUser = await userService.findByEmail(input.email);

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already exists'
        });
      }

      return userService.create(input);
    }),

  // Update user
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        email: z.string().email().optional(),
        name: z.string().min(2).optional(),
        password: z.string().min(8).optional()
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user is updating their own profile or is admin
      if (ctx.user.id !== input.id && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to update this user'
        });
      }

      return userService.update(input.id, input);
    }),

  // Delete user
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only admins can delete users
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can delete users'
        });
      }

      await userService.delete(input.id);
      return { success: true };
    })
});
```

### App Router

```typescript
// src/trpc/router.ts
import { router } from './init';
import { userRouter } from './routers/user.router';
import { postRouter } from './routers/post.router';
import { authRouter } from './routers/auth.router';

export const appRouter = router({
  user: userRouter,
  post: postRouter,
  auth: authRouter
});

export type AppRouter = typeof appRouter;
```

### Express Integration

```typescript
// src/app.ts
import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/init';

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext
  })
);

app.listen(3000);
```

### Client Usage

```typescript
// client/src/lib/trpc.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../server/src/trpc/router';
import superjson from 'superjson';

export const trpc = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      headers() {
        const token = localStorage.getItem('token');
        return token ? { authorization: `Bearer ${token}` } : {};
      }
    })
  ]
});

// Usage
async function getUsers() {
  const result = await trpc.user.getAll.query({
    page: 1,
    limit: 10,
    search: 'john'
  });

  console.log(result.data); // Fully typed!
}

async function createUser() {
  const user = await trpc.user.create.mutate({
    email: 'user@example.com',
    password: 'password123',
    name: 'John Doe'
  });

  console.log(user); // Fully typed!
}
```

## Fastify - Express Alternative

### Basic Setup

```typescript
// src/app.ts
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

const fastify = Fastify({
  logger: true
});

// Register plugins
fastify.register(cors);
fastify.register(helmet);

// Type-safe route
interface UserParams {
  id: string;
}

interface UserBody {
  name: string;
  email: string;
}

fastify.get<{
  Params: UserParams;
}>('/users/:id', async (request, reply) => {
  const { id } = request.params; // Fully typed
  return { id, name: 'John' };
});

fastify.post<{
  Body: UserBody;
}>('/users', async (request, reply) => {
  const { name, email } = request.body; // Fully typed
  return { id: '1', name, email };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

### Fastify with TypeScript Schema

```typescript
// src/routes/users.ts
import { FastifyPluginAsync } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String({ format: 'email' }),
  age: Type.Number({ minimum: 0 })
});

type User = Static<typeof UserSchema>;

const CreateUserSchema = Type.Object({
  name: Type.String({ minLength: 2 }),
  email: Type.String({ format: 'email' }),
  age: Type.Number({ minimum: 18 })
});

type CreateUser = Static<typeof CreateUserSchema>;

const usersRoute: FastifyPluginAsync = async (fastify) => {
  // GET /users
  fastify.get(
    '/users',
    {
      schema: {
        response: {
          200: Type.Array(UserSchema)
        }
      }
    },
    async (request, reply) => {
      const users: User[] = await fastify.db.user.findMany();
      return users;
    }
  );

  // POST /users
  fastify.post<{ Body: CreateUser }>(
    '/users',
    {
      schema: {
        body: CreateUserSchema,
        response: {
          201: UserSchema
        }
      }
    },
    async (request, reply) => {
      const user = await fastify.db.user.create({
        data: request.body
      });

      reply.code(201);
      return user;
    }
  );
};

export default usersRoute;
```

## Middleware Patterns

### Authentication Middleware

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types/express';

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
      role: string;
    };

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based authorization
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    next();
  };
};

// Usage
router.delete('/users/:id', authenticate, authorize('admin'), userController.delete);
```

### Validation Middleware

```typescript
// src/middleware/validation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }

      next(error);
    }
  };
};

// Usage with Zod schema
import { z } from 'zod';

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2)
  })
});

router.post('/users', validateRequest(createUserSchema), userController.create);
```

### Rate Limiting Middleware

```typescript
// src/middleware/rateLimit.middleware.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate_limit:'
  })
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true
});

// Usage
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

## Error Handling

### Custom Error Classes

```typescript
// src/errors/ApiError.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed') {
    super(400, message);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Resource already exists') {
    super(409, message);
  }
}
```

### Error Handler Middleware

```typescript
// src/middleware/errorHandler.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../errors/ApiError';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // API Error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode
    });
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors
    });
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Resource already exists',
        field: err.meta?.target
      });
    }

    // Record not found
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Resource not found'
      });
    }
  }

  // Unknown error
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
};

// Async handler wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Usage
app.use(errorHandler);
```

## Validation with Zod

### Schema Definitions

```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and number'
      ),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['admin', 'user']).default('user')
  })
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    name: z.string().min(2).optional(),
    role: z.enum(['admin', 'user']).optional()
  })
});

export const getUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID')
  })
});

export const queryUsersSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
    search: z.string().optional(),
    role: z.enum(['admin', 'user']).optional()
  })
});

// Type inference
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

## Authentication with JWT

### JWT Utilities

```typescript
// src/utils/jwt.ts
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: '30d'
  });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
};
```

### Auth Controller

```typescript
// src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { TypedRequestBody } from '../types/express';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';

interface LoginDto {
  email: string;
  password: string;
}

interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export class AuthController {
  private authService = new AuthService();

  register = async (
    req: TypedRequestBody<RegisterDto>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.authService.register(req.body);

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      res.status(201).json({
        user,
        token,
        refreshToken
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: TypedRequestBody<LoginDto>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = await this.authService.login(
        req.body.email,
        req.body.password
      );

      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      res.json({
        user,
        token,
        refreshToken
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
      }

      const payload = verifyRefreshToken(refreshToken);

      const newToken = generateToken({
        id: payload.id,
        email: payload.email,
        role: payload.role
      });

      res.json({ token: newToken });
    } catch (error) {
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  };
}
```

## Database Integration with Prisma

### Schema Definition

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(USER)
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
  @@index([published])
}

enum Role {
  ADMIN
  USER
}
```

### Prisma Client Setup

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
```

## API Documentation

### Swagger/OpenAPI Setup

```typescript
// src/config/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'RESTful API with TypeScript'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
```

### Route Documentation

```typescript
// src/routes/users.routes.ts
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 */
router.get('/', authenticate, userController.getAll);
```

## Testing APIs

### Setup

```typescript
// tests/setup.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

export const prisma = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prisma);
});
```

### Unit Tests

```typescript
// tests/services/user.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../../src/services/user.service';
import { prisma } from '../setup';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('findById', () => {
    it('should return a user when found', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user' as const,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await userService.findById('1');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: expect.any(Object)
      });
    });

    it('should return null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.findById('999');

      expect(result).toBeNull();
    });
  });
});
```

### Integration Tests

```typescript
// tests/integration/users.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/lib/prisma';

describe('Users API', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login to get auth token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    authToken = response.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/users', () => {
    it('should return all users', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      await request(app)
        .get('/api/users')
        .expect(401);
    });
  });

  describe('POST /api/users', () => {
    it('should create a new user', async () => {
      const newUser = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      };

      const response = await request(app)
        .post('/api/users')
        .send(newUser)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(newUser.email);
      expect(response.body.name).toBe(newUser.name);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 400 with invalid data', async () => {
      const invalidUser = {
        email: 'invalid-email',
        password: '123'
      };

      await request(app)
        .post('/api/users')
        .send(invalidUser)
        .expect(400);
    });
  });
});
```

## Best Practices

### 1. Layered Architecture

```typescript
// Good: Separation of concerns
// Controller -> Service -> Repository/Prisma

// Bad: Business logic in controller
router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany();
  const filtered = users.filter(/* complex logic */);
  res.json(filtered);
});
```

### 2. Input Validation

```typescript
// Good: Validate all inputs
router.post('/users', validateRequest(createUserSchema), controller.create);

// Bad: No validation
router.post('/users', controller.create);
```

### 3. Error Handling

```typescript
// Good: Proper error handling
try {
  const user = await userService.findById(id);
  if (!user) throw new NotFoundError('User not found');
  res.json(user);
} catch (error) {
  next(error);
}

// Bad: Silent failures
const user = await userService.findById(id);
res.json(user); // Could be null
```

### 4. Type Safety

```typescript
// Good: Strong typing
interface CreateUserDto {
  email: string;
  password: string;
  name: string;
}

async function create(data: CreateUserDto): Promise<User> {
  // ...
}

// Bad: Any types
async function create(data: any): Promise<any> {
  // ...
}
```

This guide covers essential patterns for building production-ready APIs with TypeScript.
