import cron from 'node-cron';
import { prisma } from '../db/client.js';
import { expandOccurrences } from '../services/recurrence.js';
import { notifyReminder, notifyTaskDue } from '../services/notificationService.js';

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

/** Hour of the local morning a "remind me on the day" task nudge goes out. */
const MORNING_HOUR = 9;

/**
 * Offset of a timezone from UTC at a given moment, in minutes. Uses Intl rather
 * than a date library so DST is handled by the platform's tz database.
 */
function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((p) => [p.type, p.value]),
    ) as Record<string, string>;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === '24' ? '00' : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return (asUtc - at.getTime()) / 60_000;
  } catch {
    return 0;
  }
}

/**
 * The instant a task reminder is due: the morning of the deadline in the
 * family's timezone, moved a day or a week earlier for the other modes.
 */
export function taskRemindAt(dueDate: Date, remindMode: string, timeZone: string): Date | null {
  const daysEarlier = remindMode === 'dayBefore' ? 1 : remindMode === 'weekBefore' ? 7 : 0;
  if (remindMode !== 'morning' && daysEarlier === 0) return null;

  const localMorningAsUtc = new Date(
    dueDate.getTime() - daysEarlier * 86_400_000 + MORNING_HOUR * 3_600_000,
  );
  // Convert that wall-clock time in the family's zone to a real instant.
  const offset = timezoneOffsetMinutes(timeZone, localMorningAsUtc);
  return new Date(localMorningAsUtc.getTime() - offset * 60_000);
}

/** Sends task reminders whose moment has arrived. Exported for tests. */
export async function runTaskReminderTick(now = new Date()): Promise<number> {
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, done: false, remindMode: { not: null }, dueDate: { not: null } },
    include: { family: true },
  });

  let sent = 0;
  for (const task of tasks) {
    const remindAt = taskRemindAt(task.dueDate!, task.remindMode!, task.family.timezone);
    if (!remindAt || remindAt > now) continue;
    // Don't resurrect reminders for deadlines that passed long ago.
    if (now.getTime() - remindAt.getTime() > 2 * 86_400_000) continue;

    try {
      // The unique constraint is what makes delivery exactly-once.
      await prisma.taskReminderLog.create({ data: { taskId: task.id, remindAt } });
    } catch {
      continue;
    }

    await notifyTaskDue(task.id);
    sent++;
  }

  return sent;
}

export function startReminderScheduler() {
  return cron.schedule('* * * * *', () => {
    runReminderTick().catch((err) => console.error('[reminders] tick failed', err));
    runTaskReminderTick().catch((err) => console.error('[reminders] task tick failed', err));
  });
}
