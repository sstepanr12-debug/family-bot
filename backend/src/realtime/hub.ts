import type { Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { env } from '../config/env.js';
import { verifySession } from '../auth/session.js';
import { prisma } from '../db/client.js';

export type FamilyEvent =
  | { type: 'event:created'; event: unknown }
  | { type: 'event:updated'; event: unknown }
  | { type: 'event:deleted'; eventId: string; occurrenceStart?: string }
  | { type: 'task:created'; task: unknown }
  | { type: 'task:updated'; task: unknown }
  | { type: 'task:deleted'; taskId: string }
  // Categories are few and rarely change; clients just refetch the list.
  | { type: 'category:changed' };

let io: IOServer | null = null;

const room = (familyId: string) => `family:${familyId}`;

export function initHub(server: HttpServer): IOServer {
  io = new IOServer(server, { cors: { origin: env.corsOrigins, credentials: true } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing token'));
    try {
      socket.data.userId = verifySession(token).userId;
      next();
    } catch {
      next(new Error('Invalid session'));
    }
  });

  io.on('connection', (socket) => {
    // Join only the families this user actually belongs to.
    socket.on('join', async (familyId: string, ack?: (ok: boolean) => void) => {
      const membership = await prisma.membership.findUnique({
        where: { userId_familyId: { userId: socket.data.userId, familyId } },
      });
      if (!membership) return ack?.(false);
      await socket.join(room(familyId));
      ack?.(true);
    });

    socket.on('leave', (familyId: string) => {
      void socket.leave(room(familyId));
    });
  });

  return io;
}

/** Broadcasts a change to everyone currently viewing that family's calendar. */
export function emitToFamily(familyId: string, message: FamilyEvent) {
  io?.to(room(familyId)).emit(message.type, message);
}

/** Test seam: lets unit tests observe emissions without a real server. */
export function setHubForTesting(fake: Pick<IOServer, 'to'> | null) {
  io = fake as IOServer | null;
}
