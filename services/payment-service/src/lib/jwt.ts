import jwt from 'jsonwebtoken';
import { requireEnv } from '@bostonia/shared';

// Lazy-load to ensure dotenv has loaded first
const getJwtSecret = () => requireEnv('JWT_SECRET');

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
