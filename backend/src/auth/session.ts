import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface SessionPayload {
  userId: string;
}

const TTL = '30d';

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TTL });
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string' || typeof decoded.userId !== 'string') {
    throw new Error('Malformed session token');
  }
  return { userId: decoded.userId };
}
