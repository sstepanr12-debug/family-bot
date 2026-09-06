/**
 * Minimal RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL, UNTIL and COUNT.
 * Everything is computed in UTC so expansion is deterministic regardless of
 * where the server runs; display timezone is a frontend concern.
 */
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Rule {
  freq: Freq;
  interval: number;
  until?: Date;
  count?: number;
}

const FREQS: Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/** Parses "FREQ=WEEKLY;INTERVAL=2;UNTIL=2026-01-01T00:00:00.000Z". */
export function parseRule(rrule: string): Rule {
  const parts = new Map<string, string>();
  for (const chunk of rrule.split(';')) {
    if (!chunk.trim()) continue;
    const idx = chunk.indexOf('=');
    if (idx === -1) throw new Error(`Malformed RRULE part: ${chunk}`);
    parts.set(chunk.slice(0, idx).trim().toUpperCase(), chunk.slice(idx + 1).trim());
  }

  const freq = (parts.get('FREQ') ?? '').toUpperCase() as Freq;
  if (!FREQS.includes(freq)) throw new Error(`Unsupported FREQ: ${parts.get('FREQ')}`);

  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error('INTERVAL must be a positive integer');

  const rule: Rule = { freq, interval };

  const until = parts.get('UNTIL');
  if (until) {
    const d = new Date(until);
    if (Number.isNaN(d.getTime())) throw new Error(`Malformed UNTIL: ${until}`);
    rule.until = d;
  }

  const count = parts.get('COUNT');
  if (count) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1) throw new Error('COUNT must be a positive integer');
    rule.count = n;
  }

  return rule;
}

export function formatRule(rule: Rule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.until) parts.push(`UNTIL=${rule.until.toISOString()}`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  return parts.join(';');
}

/** Adds n months keeping the day-of-month, clamping to the last valid day. */
function addMonths(date: Date, n: number): Date {
  const day = date.getUTCDate();
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + n);
  const daysInMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, daysInMonth));
  return shifted;
}

function advance(start: Date, rule: Rule, step: number): Date {
  switch (rule.freq) {
    case 'DAILY':
      return new Date(start.getTime() + step * rule.interval * 86_400_000);
    case 'WEEKLY':
      return new Date(start.getTime() + step * rule.interval * 7 * 86_400_000);
    case 'MONTHLY':
      return addMonths(start, step * rule.interval);
  }
}

/** Hard cap so a malformed rule can never spin forever. */
const MAX_OCCURRENCES = 1000;

/**
 * First occurrence index that can still overlap `rangeStart`, so a series that
 * started years ago does not have to be walked step by step.
 */
function firstIndexNear(dtstart: Date, rule: Rule, durationMs: number, rangeStart: Date): number {
  const elapsed = rangeStart.getTime() - durationMs - dtstart.getTime();
  if (elapsed <= 0) return 0;

  let stepMs: number;
  switch (rule.freq) {
    case 'DAILY':
      stepMs = rule.interval * 86_400_000;
      break;
    case 'WEEKLY':
      stepMs = rule.interval * 7 * 86_400_000;
      break;
    case 'MONTHLY':
      // Months vary in length; undershoot with the shortest one and let the
      // loop walk the remaining occurrence or two.
      stepMs = rule.interval * 28 * 86_400_000;
      break;
  }
  return Math.max(0, Math.floor(elapsed / stepMs));
}

/**
 * Start times of every occurrence that begins before `rangeEnd` and ends after
 * `rangeStart`. `rangeStart`/`rangeEnd` are inclusive/exclusive respectively.
 */
export function expandOccurrences(
  dtstart: Date,
  durationMs: number,
  rrule: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  if (!rrule) {
    const end = new Date(dtstart.getTime() + durationMs);
    return dtstart < rangeEnd && end > rangeStart ? [dtstart] : [];
  }

  const rule = parseRule(rrule);
  const out: Date[] = [];

  const first = firstIndexNear(dtstart, rule, durationMs, rangeStart);
  for (let i = first; i < first + MAX_OCCURRENCES; i++) {
    if (rule.count !== undefined && i >= rule.count) break;

    const start = advance(dtstart, rule, i);
    if (rule.until && start > rule.until) break;
    if (start >= rangeEnd) break;

    const end = new Date(start.getTime() + durationMs);
    if (end > rangeStart) out.push(start);
  }

  return out;
}

/** Next occurrence at or after `from`, or null once the series is exhausted. */
export function nextOccurrenceAfter(
  dtstart: Date,
  durationMs: number,
  rrule: string | null | undefined,
  from: Date,
  horizon: Date,
): Date | null {
  const hits = expandOccurrences(dtstart, durationMs, rrule, from, horizon);
  return hits.find((d) => d >= from) ?? null;
}
