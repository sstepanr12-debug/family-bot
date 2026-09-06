import { prisma } from '../db/client.js';
import { sendMessage } from '../bot/bot.js';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatWhen(startsAt: Date, allDay: boolean, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
    timeZone,
  });
  try {
    return fmt.format(startsAt);
  } catch {
    return dateFormat.format(startsAt);
  }
}

/** Everyone in the family except `exceptUserId`, with their Telegram chat ids. */
async function recipients(familyId: string, exceptUserId?: string) {
  const memberships = await prisma.membership.findMany({
    where: { familyId, ...(exceptUserId ? { userId: { not: exceptUserId } } : {}) },
    include: { user: true },
  });
  return memberships.map((m) => m.user);
}

export async function notifyEventCreated(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { author: true, family: true },
  });
  if (!event) return;

  const when = formatWhen(event.startsAt, event.allDay, event.family.timezone);
  const text =
    `<b>${escapeHtml(event.title)}</b>\n` +
    `${when}\n` +
    `Добавил(а): ${escapeHtml(event.author.firstName)} · ${escapeHtml(event.family.name)}`;

  const users = await recipients(event.familyId, event.authorId);
  await Promise.all(users.map((u) => sendMessage(u.telegramId, text)));
}

export async function notifyReminder(
  eventId: string,
  occurrenceStart: Date,
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { family: true, participants: true },
  });
  if (!event) return;

  const when = formatWhen(occurrenceStart, event.allDay, event.family.timezone);
  const text = `⏰ Скоро: <b>${escapeHtml(event.title)}</b>\n${when}`;

  // A reminder goes to the named participants, or to the whole family when the
  // event has none.
  const users = await recipients(event.familyId);
  const targeted =
    event.participants.length > 0
      ? users.filter((u) => event.participants.some((p) => p.userId === u.id))
      : users;

  await Promise.all(targeted.map((u) => sendMessage(u.telegramId, text)));
}
