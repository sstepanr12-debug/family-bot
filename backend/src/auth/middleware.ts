import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { verifySession } from './session.js';
import { HttpError } from '../lib/httpError.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Rejects the request unless it carries a valid session token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(new HttpError(401, 'Missing bearer token'));
  }
  try {
    req.userId = verifySession(token).userId;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired session'));
  }
}

/** Throws unless the user belongs to the family; returns their membership. */
export async function assertMember(userId: string, familyId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_familyId: { userId, familyId } },
  });
  if (!membership) throw new HttpError(403, 'You are not a member of this family');
  return membership;
}
