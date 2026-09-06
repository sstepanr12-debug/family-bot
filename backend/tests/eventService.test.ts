import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db/client.js';
import { setHubForTesting } from '../src/realtime/hub.js';
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
} from '../src/services/eventService.js';
import { createEventSchema } from '../src/services/schemas.js';

// The bot is a no-op without a token, but stub the network layer anyway so a
// test run never depends on it.
vi.mock('../src/bot/bot.js', () => ({ sendMessage: vi.fn().mockResolvedValue(true) }));

const emitted: { room: string; type: string }[] = [];
setHubForTesting({
  to: (room: string) => ({
    emit: (type: string) => {
      emitted.push({ room, type });
    },
  }),
} as never);

async function seed() {
  await prisma.reminderLog.deleteMany();
  await prisma.eventException.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
  emitted.length = 0;

  const anya = await prisma.user.create({
    data: { telegramId: '1', firstName: 'Аня' },
  });
  const oleg = await prisma.user.create({
    data: { telegramId: '2', firstName: 'Олег' },
  });
  const outsider = await prisma.user.create({
    data: { telegramId: '3', firstName: 'Чужой' },
  });

  const family = await prisma.family.create({
    data: {
      name: 'Дом',
      inviteCode: 'ABCD2345',
      members: { create: [{ userId: anya.id, role: 'owner' }, { userId: oleg.id }] },
    },
  });
  const other = await prisma.family.create({
    data: { name: 'Другая', inviteCode: 'ZZZZ9876', members: { create: { userId: outsider.id } } },
  });

  return { anya, oleg, outsider, family, other };
}

const WEEK_FROM = new Date('2026-09-07T00:00:00.000Z');
const WEEK_TO = new Date('2026-09-14T00:00:00.000Z');

function eventBody(familyId: string, over: Record<string, unknown> = {}) {
  return createEventSchema.parse({
    familyId,
    title: 'Ужин',
    startsAt: '2026-09-07T18:00:00.000Z',
    endsAt: '2026-09-07T19:00:00.000Z',
    ...over,
  });
}

let ctx: Awaited<ReturnType<typeof seed>>;
beforeEach(async () => {
  ctx = await seed();
});

describe('createEvent', () => {
  it('stores the event, records the author and broadcasts it', async () => {
    const dto = await createEvent(ctx.anya.id, eventBody(ctx.family.id));

    expect(dto.title).toBe('Ужин');
    expect(dto.author.firstName).toBe('Аня');
    expect(dto.isRecurring).toBe(false);
    expect(emitted).toContainEqual({ room: `family:${ctx.family.id}`, type: 'event:created' });
  });

  it('refuses a family the user does not belong to', async () => {
    await expect(createEvent(ctx.outsider.id, eventBody(ctx.family.id))).rejects.toThrow(
      /not a member/,
    );
  });

  it('refuses participants from outside the family', async () => {
    await expect(
      createEvent(ctx.anya.id, eventBody(ctx.family.id, { participantIds: [ctx.outsider.id] })),
    ).rejects.toThrow(/not members/);
  });

  it('rejects an end time before the start time', () => {
    expect(() =>
      eventBody(ctx.family.id, { endsAt: '2026-09-07T17:00:00.000Z' }),
    ).toThrow(/endsAt/);
  });
});

describe('listEvents', () => {
  it('returns only the requesting family and only the requested window', async () => {
    await createEvent(ctx.anya.id, eventBody(ctx.family.id));
    await createEvent(ctx.anya.id, eventBody(ctx.family.id, {
      title: 'Далеко',
      startsAt: '2026-11-01T10:00:00.000Z',
      endsAt: '2026-11-01T11:00:00.000Z',
    }));

    const week = await listEvents(ctx.oleg.id, ctx.family.id, WEEK_FROM, WEEK_TO);
    expect(week.map((e) => e.title)).toEqual(['Ужин']);

    await expect(listEvents(ctx.outsider.id, ctx.family.id, WEEK_FROM, WEEK_TO)).rejects.toThrow(
      /not a member/,
    );
  });

  it('expands a weekly series into each week of the range', async () => {
    await createEvent(ctx.anya.id, eventBody(ctx.family.id, { rrule: 'FREQ=WEEKLY' }));
    const month = await listEvents(
      ctx.anya.id,
      ctx.family.id,
      WEEK_FROM,
      new Date('2026-10-05T00:00:00.000Z'),
    );
    expect(month.map((e) => e.occurrenceStart)).toEqual([
      '2026-09-07T18:00:00.000Z',
      '2026-09-14T18:00:00.000Z',
      '2026-09-21T18:00:00.000Z',
      '2026-09-28T18:00:00.000Z',
    ]);
  });
});

describe('updateEvent', () => {
  it('records the last editor on a whole-series edit', async () => {
    const created = await createEvent(ctx.anya.id, eventBody(ctx.family.id));
    const updated = await updateEvent(ctx.oleg.id, created.id, { title: 'Поздний ужин' }, 'all');

    expect(updated.title).toBe('Поздний ужин');
    expect(updated.updatedBy?.firstName).toBe('Олег');
    expect(emitted.at(-1)).toEqual({ room: `family:${ctx.family.id}`, type: 'event:updated' });
  });

  it('moves a single occurrence without touching the rest of the series', async () => {
    const created = await createEvent(ctx.anya.id, eventBody(ctx.family.id, { rrule: 'FREQ=WEEKLY' }));
    await updateEvent(
      ctx.anya.id,
      created.id,
      { title: 'Ужин в кафе', startsAt: new Date('2026-09-14T20:00:00.000Z') },
      'this',
      new Date('2026-09-14T18:00:00.000Z'),
    );

    const list = await listEvents(ctx.anya.id, ctx.family.id, WEEK_FROM, new Date('2026-09-28T00:00:00.000Z'));
    expect(list.map((e) => [e.title, e.startsAt])).toEqual([
      ['Ужин', '2026-09-07T18:00:00.000Z'],
      ['Ужин в кафе', '2026-09-14T20:00:00.000Z'],
      ['Ужин', '2026-09-21T18:00:00.000Z'],
    ]);
  });
});

describe('deleteEvent', () => {
  it('cancels one occurrence with scope=this', async () => {
    const created = await createEvent(ctx.anya.id, eventBody(ctx.family.id, { rrule: 'FREQ=WEEKLY' }));
    await deleteEvent(ctx.anya.id, created.id, 'this', new Date('2026-09-14T18:00:00.000Z'));

    const list = await listEvents(ctx.anya.id, ctx.family.id, WEEK_FROM, new Date('2026-09-28T00:00:00.000Z'));
    expect(list.map((e) => e.occurrenceStart)).toEqual([
      '2026-09-07T18:00:00.000Z',
      '2026-09-21T18:00:00.000Z',
    ]);
  });

  it('soft-deletes the whole series with scope=all', async () => {
    const created = await createEvent(ctx.anya.id, eventBody(ctx.family.id, { rrule: 'FREQ=WEEKLY' }));
    await deleteEvent(ctx.oleg.id, created.id, 'all');

    expect(await listEvents(ctx.anya.id, ctx.family.id, WEEK_FROM, WEEK_TO)).toEqual([]);
    const row = await prisma.event.findUnique({ where: { id: created.id } });
    expect(row?.deletedAt).not.toBeNull();
  });
});
