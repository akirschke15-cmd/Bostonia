import jwt from 'jsonwebtoken';
import { requireEnv } from '@bostonia/shared';

// Lazy-load to ensure dotenv has loaded first
const getJwtSecret = () => requireEnv('JWT_SECRET');
const getJwtExpiresIn = () => process.env.JWT_EXPIRES_IN || '15m';
const getRefreshTokenExpiresIn = () => process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export function generateAccessToken(user: { id: string; email: string; role: string }): string {
  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: String(user.role),
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  } as jwt.SignOptions);
}

export function generateRefreshToken(userId: string, tokenId: string): string {
  const payload: RefreshTokenPayload = {
    userId,
    tokenId,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getRefreshTokenExpiresIn(),
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getJwtSecret()) as RefreshTokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}

export function getTokenExpiry(expiresIn: string): Date {
  const now = new Date();
  const match = expiresIn.match(/^(\d+)([smhd])$/);

  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid expiry format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      now.setSeconds(now.getSeconds() + value);
      break;
    case 'm':
      now.setMinutes(now.getMinutes() + value);
      break;
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'd':
      now.setDate(now.getDate() + value);
      break;
  }

  return now;
}
