import { Router, type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';
import { prisma } from '@bostonia/database';
import {
  registerUserSchema,
  loginUserSchema,
  successResponse,
  ErrorCodes,
  generateId
} from '@bostonia/shared';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getTokenExpiry
} from '../lib/jwt.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AppError } from '../middleware/error-handler.js';

export const authRouter: Router = Router();

// Register with email/password
authRouter.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerUserSchema.parse(req.body);

    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email },
          { username: data.username },
        ],
      },
    });

    if (existing) {
      const field = existing.email === data.email ? 'email' : 'username';
      throw new AppError(ErrorCodes.ALREADY_EXISTS, `User with this ${field} already exists`);
    }

    // Create user
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        preferences: {
          create: {},
        },
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const tokenId = generateId();
    const refreshToken = generateRefreshToken(user.id, tokenId);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: getTokenExpiry(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    });

    res.status(201).json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    }));
  } catch (error) {
    next(error);
  }
});

// Login with email/password
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = loginUserSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const valid = await verifyPassword(data.password, user.passwordHash);
    if (!valid) {
      throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Account is not active');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const tokenId = generateId();
    const refreshToken = generateRefreshToken(user.id, tokenId);

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: getTokenExpiry(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    });

    res.json(successResponse({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        credits: user.credits,
        subscriptionTier: user.subscriptionTier,
      },
      accessToken,
      refreshToken,
    }));
  } catch (error) {
    next(error);
  }
});

// Refresh token
authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError(ErrorCodes.INVALID_INPUT, 'Refresh token required');
    }

    // Verify token
    verifyRefreshToken(refreshToken);

    // Check token in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new AppError(ErrorCodes.INVALID_TOKEN, 'Invalid refresh token');
    }

    if (storedToken.user.status !== 'ACTIVE') {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Account is not active');
    }

    // Revoke old token and create new one
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate new tokens
    const accessToken = generateAccessToken({
      id: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });
    const newTokenId = generateId();
    const newRefreshToken = generateRefreshToken(storedToken.user.id, newTokenId);

    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: newRefreshToken,
        expiresAt: getTokenExpiry(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    });

    res.json(successResponse({
      accessToken,
      refreshToken: newRefreshToken,
    }));
  } catch (error) {
    next(error);
  }
});

// Logout
authRouter.post('/logout', authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Revoke specific token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { isRevoked: true },
      });
    } else if (authReq.authUser) {
      // Revoke all tokens for user
      await prisma.refreshToken.updateMany({
        where: { userId: authReq.authUser.userId },
        data: { isRevoked: true },
      });
    }

    res.json(successResponse({ message: 'Logged out successfully' }));
  } catch (error) {
    next(error);
  }
});

// Get current user
authRouter.get('/me', authenticate({ loadUser: true }), async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = authReq.authUser!.dbUser!;
  res.json(successResponse({
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    credits: user.credits,
    subscriptionTier: user.subscriptionTier,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  }));
});

// Google OAuth routes
authRouter.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

authRouter.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req: Request, res: Response) => {
    const user = req.user as any;

    // Generate tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const tokenId = generateId();
    const refreshToken = generateRefreshToken(user.id, tokenId);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: getTokenExpiry(process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'),
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    });

    // Redirect to frontend with tokens
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
  }
);
