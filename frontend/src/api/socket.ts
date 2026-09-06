import { io, type Socket } from 'socket.io-client';
import { getToken } from './client';
import type { CalendarEvent, Task } from './types';

/** Empty = same origin, matching api/client.ts. */
const BASE = import.meta.env.VITE_API_URL ?? '';

export interface CalendarHandlers {
  onCreated(event: CalendarEvent): void;
  onUpdated(event: CalendarEvent): void;
  onDeleted(payload: { eventId: string; occurrenceStart?: string }): void;
  onTaskChanged(task: Task): void;
  onTaskDeleted(taskId: string): void;
  onCategoriesChanged(): void;
}

/**
 * Subscribes to one family's live changes. Returns a disposer; call it when the
 * selected family changes so the socket never fans out to a stale room.
 */
export function subscribeToFamily(familyId: string, handlers: CalendarHandlers): () => void {
  const socket: Socket = io(BASE || undefined, {
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
  });

  const join = () => socket.emit('join', familyId);
  socket.on('connect', join);

  socket.on('event:created', (msg: { event: CalendarEvent }) => handlers.onCreated(msg.event));
  socket.on('event:updated', (msg: { event: CalendarEvent }) => handlers.onUpdated(msg.event));
  socket.on('event:deleted', (msg: { eventId: string; occurrenceStart?: string }) =>
    handlers.onDeleted(msg),
  );

  socket.on('task:created', (msg: { task: Task }) => handlers.onTaskChanged(msg.task));
  socket.on('task:updated', (msg: { task: Task }) => handlers.onTaskChanged(msg.task));
  socket.on('task:deleted', (msg: { taskId: string }) => handlers.onTaskDeleted(msg.taskId));
  socket.on('category:changed', () => handlers.onCategoriesChanged());

  return () => {
    socket.emit('leave', familyId);
    socket.close();
  };
}
