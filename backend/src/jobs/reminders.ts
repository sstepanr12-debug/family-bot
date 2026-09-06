import cron from 'node-cron';
import { prisma } from '../db/client.js';
import { expandOccurrences } from '../services/recurrence.js';
import { notifyReminder } from '../services/notificationService.js';

/** How far ahead a reminder may be scheduled — bounds the scan window. */
const MAX_REMINDER_MINUTES = 60 * 24 * 7;

/**
 * Sends every reminder whose moment has arrived since the previous tick.
 * Exported so tests and manual runs can drive it without the cron wrapper.
 */
export async function runReminderTick(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + MAX_REMINDER_MINUTES * 60_000);

  const events = await prisma.event.findMany({
    where: {
      deletedAt: null,
      reminderMinutes: { not: null },
      OR: [{ rrule: null, startsAt: { gte: now } }, { rrule: { not: null } }],
    },
    include: { exceptions: true },
  });

  let sent = 0;
  for (const event of events) {
    const lead = (event.reminderMinutes ?? 0) * 60_000;
    const durationMs = event.endsAt.getTime() - event.startsAt.getTime();

    // Candidates are occurrences starting between now and now+lead: their
    // reminder moment (start - lead) is at or before now.
    const starts = expandOccurrences(
      event.startsAt,
      durationMs,
      event.rrule,
      now,
      new Date(Math.min(now.getTime() + lead + 60_000, horizon.getTime() + lead)),
    );

    for (const start of starts) {
      const exception = event.exceptions.find((e) => e.originalDate.getTime() === start.getTime());
      if (exception?.cancelled) continue;
      const actualStart = exception?.startsAt ?? start;

      if (actualStart.getTime() - lead > now.getTime()) continue;
      if (actualStart.getTime() < now.getTime()) continue;

      try {
        // The unique constraint is what makes delivery exactly-once across
        // restarts: a duplicate insert throws and we skip sending.
        await prisma.reminderLog.create({
          data: { eventId: event.id, occurrenceStart: actualStart },
        });
      } catch {
        continue;
      }

      await notifyReminder(event.id, actualStart);
      sent++;
    }
  }

  return sent;
}

export function startReminderScheduler() {
  return cron.schedule('* * * * *', () => {
    runReminderTick().catch((err) => console.error('[reminders] tick failed', err));
  });
}
