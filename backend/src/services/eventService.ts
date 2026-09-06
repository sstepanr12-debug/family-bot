import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../lib/httpError.js';
import { assertMember } from '../auth/middleware.js';
import { emitToFamily } from '../realtime/hub.js';
import { expandOccurrences } from './recurrence.js';
import { notifyEventCreated } from './notificationService.js';
import type { CreateEventInput, UpdateEventInput } from './schemas.js';

const eventInclude = {
  author: true,
  updatedBy: true,
  participants: { include: { user: true } },
  exceptions: true,
} satisfies Prisma.EventInclude;

type EventWithRelations = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

interface Person {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}

function personDto(user: Person) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, photoUrl: user.photoUrl };
}

interface OccurrenceOverride {
  startsAt: Date;
  endsAt: Date;
  title?: string;
  description?: string | null;
}

/** Shape sent to the client; `occurrenceStart` identifies one instance of a series. */
export function toEventDto(event: EventWithRelations, occurrence?: OccurrenceOverride) {
  return {
    id: event.id,
    familyId: event.familyId,
    title: occurrence?.title ?? event.title,
    description: occurrence?.description ?? event.description,
    startsAt: (occurrence?.startsAt ?? event.startsAt).toISOString(),
    endsAt: (occurrence?.endsAt ?? event.endsAt).toISOString(),
    /** Anchor of this instance inside the series; equals startsAt for one-offs. */
    occurrenceStart: (occurrence?.startsAt ?? event.startsAt).toISOString(),
    seriesStart: event.startsAt.toISOString(),
    allDay: event.allDay,
    category: event.category,
    color: event.color,
    rrule: event.rrule,
    reminderMinutes: event.reminderMinutes,
    author: personDto(event.author),
    updatedBy: event.updatedBy ? personDto(event.updatedBy) : null,
    updatedAt: event.updatedAt.toISOString(),
    participants: event.participants.map((p) => personDto(p.user)),
    isRecurring: Boolean(event.rrule),
  };
}

export type EventDto = ReturnType<typeof toEventDto>;

async function loadEvent(eventId: string): Promise<EventWithRelations> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: eventInclude,
  });
  if (!event) throw new HttpError(404, 'Event not found');
  return event;
}

/** Participants must themselves be members of the family owning the event. */
async function assertParticipantsInFamily(familyId: string, participantIds: string[]) {
  if (participantIds.length === 0) return;
  const unique = [...new Set(participantIds)];
  const count = await prisma.membership.count({
    where: { familyId, userId: { in: unique } },
  });
  if (count !== unique.length) {
    throw new HttpError(400, 'Some participants are not members of this family');
  }
}

export async function listEvents(userId: string, familyId: string, from: Date, to: Date): Promise<EventDto[]> {
  await assertMember(userId, familyId);

  const events = await prisma.event.findMany({
    where: {
      familyId,
      deletedAt: null,
      // One-off events must overlap the window; recurring ones only need to have
      // started before it — expansion decides which instances land inside.
      OR: [
        { rrule: null, startsAt: { lt: to }, endsAt: { gt: from } },
        { rrule: { not: null }, startsAt: { lt: to } },
      ],
    },
    include: eventInclude,
  });

  const out: EventDto[] = [];
  for (const event of events) {
    const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
    // Widen the window so an occurrence moved by an exception is still found.
    const starts = expandOccurrences(event.startsAt, durationMs, event.rrule, from, to);

    for (const start of starts) {
      const exception = event.exceptions.find((e) => e.originalDate.getTime() === start.getTime());
      if (exception?.cancelled) continue;

      const startsAt = exception?.startsAt ?? start;
      const endsAt = exception?.endsAt ?? new Date(start.getTime() + durationMs);
      // A moved occurrence can land outside the requested window.
      if (startsAt >= to || endsAt <= from) continue;

      out.push(
        toEventDto(event, {
          startsAt,
          endsAt,
          title: exception?.title ?? undefined,
          description: exception?.description ?? undefined,
        }),
      );
    }
  }

  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function createEvent(userId: string, input: CreateEventInput): Promise<EventDto> {
  await assertMember(userId, input.familyId);
  await assertParticipantsInFamily(input.familyId, input.participantIds);

  const created = await prisma.event.create({
    data: {
      familyId: input.familyId,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      category: input.category,
      color: input.color ?? null,
      rrule: input.rrule ?? null,
      reminderMinutes: input.reminderMinutes ?? null,
      authorId: userId,
      participants: { create: [...new Set(input.participantIds)].map((id) => ({ userId: id })) },
    },
    include: eventInclude,
  });

  const dto = toEventDto(created);
  emitToFamily(created.familyId, { type: 'event:created', event: dto });
  // Fire-and-forget: a failing notification must never fail the request, and
  // must never surface as an unhandled rejection.
  void notifyEventCreated(created.id).catch((err) =>
    console.warn('[notify] event:created failed', err),
  );
  return dto;
}

export async function updateEvent(
  userId: string,
  eventId: string,
  input: UpdateEventInput,
  scope: 'this' | 'all',
  occurrenceStart?: Date,
): Promise<EventDto> {
  const event = await loadEvent(eventId);
  await assertMember(userId, event.familyId);
  if (input.participantIds) await assertParticipantsInFamily(event.familyId, input.participantIds);

  if (scope === 'this' && event.rrule) {
    if (!occurrenceStart) throw new HttpError(400, 'occurrenceStart is required when scope=this');
    const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
    const startsAt = input.startsAt ?? occurrenceStart;
    const endsAt = input.endsAt ?? new Date(startsAt.getTime() + durationMs);
    const fields = {
      cancelled: false,
      title: input.title ?? null,
      description: input.description ?? null,
      startsAt,
      endsAt,
    };
    await prisma.eventException.upsert({
      where: { eventId_originalDate: { eventId, originalDate: occurrenceStart } },
      update: fields,
      create: { eventId, originalDate: occurrenceStart, ...fields },
    });
    await prisma.event.update({ where: { id: eventId }, data: { updatedById: userId } });
  } else {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
        ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
        ...(input.rrule !== undefined ? { rrule: input.rrule ?? null } : {}),
        ...(input.reminderMinutes !== undefined ? { reminderMinutes: input.reminderMinutes ?? null } : {}),
        updatedById: userId,
        ...(input.participantIds
          ? {
              participants: {
                deleteMany: {},
                create: [...new Set(input.participantIds)].map((id) => ({ userId: id })),
              },
            }
          : {}),
      },
    });
    // Re-timing or re-ruling the series invalidates per-occurrence overrides,
    // which are anchored to the old occurrence dates.
    if (input.startsAt !== undefined || input.rrule !== undefined) {
      await prisma.eventException.deleteMany({ where: { eventId } });
    }
  }

  const fresh = await loadEvent(eventId);
  const dto = toEventDto(fresh);
  emitToFamily(fresh.familyId, { type: 'event:updated', event: dto });
  return dto;
}

export async function deleteEvent(
  userId: string,
  eventId: string,
  scope: 'this' | 'all',
  occurrenceStart?: Date,
): Promise<void> {
  const event = await loadEvent(eventId);
  await assertMember(userId, event.familyId);

  if (scope === 'this' && event.rrule) {
    if (!occurrenceStart) throw new HttpError(400, 'occurrenceStart is required when scope=this');
    await prisma.eventException.upsert({
      where: { eventId_originalDate: { eventId, originalDate: occurrenceStart } },
      update: { cancelled: true },
      create: { eventId, originalDate: occurrenceStart, cancelled: true },
    });
    emitToFamily(event.familyId, {
      type: 'event:deleted',
      eventId,
      occurrenceStart: occurrenceStart.toISOString(),
    });
    return;
  }

  // Soft delete keeps the audit trail and the reminder log meaningful.
  await prisma.event.update({
    where: { id: eventId },
    data: { deletedAt: new Date(), updatedById: userId },
  });
  emitToFamily(event.familyId, { type: 'event:deleted', eventId });
}
