import { describe, expect, it } from 'vitest';
import { expandOccurrences, formatRule, parseRule } from '../src/services/recurrence.js';

const HOUR = 3_600_000;
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe('parseRule', () => {
  it('parses freq, interval, until and count', () => {
    const rule = parseRule('FREQ=WEEKLY;INTERVAL=2;UNTIL=2026-10-01T00:00:00.000Z;COUNT=5');
    expect(rule.freq).toBe('WEEKLY');
    expect(rule.interval).toBe(2);
    expect(rule.until?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(rule.count).toBe(5);
  });

  it('defaults interval to 1 and round-trips through formatRule', () => {
    expect(parseRule('FREQ=DAILY').interval).toBe(1);
    expect(formatRule({ freq: 'MONTHLY', interval: 3 })).toBe('FREQ=MONTHLY;INTERVAL=3');
  });

  it('rejects unsupported frequencies and intervals', () => {
    expect(() => parseRule('FREQ=YEARLY')).toThrow();
    expect(() => parseRule('FREQ=DAILY;INTERVAL=0')).toThrow();
  });
});

describe('expandOccurrences', () => {
  const start = new Date('2026-09-07T09:00:00.000Z'); // Monday

  it('returns a one-off event only when it overlaps the window', () => {
    expect(
      expandOccurrences(start, HOUR, null, new Date('2026-09-07T00:00:00Z'), new Date('2026-09-08T00:00:00Z')),
    ).toHaveLength(1);
    expect(
      expandOccurrences(start, HOUR, null, new Date('2026-09-08T00:00:00Z'), new Date('2026-09-09T00:00:00Z')),
    ).toHaveLength(0);
  });

  it('expands a daily rule across the requested week', () => {
    const hits = expandOccurrences(
      start,
      HOUR,
      'FREQ=DAILY',
      new Date('2026-09-07T00:00:00Z'),
      new Date('2026-09-10T00:00:00Z'),
    );
    expect(iso(hits)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-08T09:00:00.000Z',
      '2026-09-09T09:00:00.000Z',
    ]);
  });

  it('honours INTERVAL on a weekly rule', () => {
    const hits = expandOccurrences(
      start,
      HOUR,
      'FREQ=WEEKLY;INTERVAL=2',
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-15T00:00:00Z'),
    );
    expect(iso(hits)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-21T09:00:00.000Z',
      '2026-10-05T09:00:00.000Z',
    ]);
  });

  it('stops at UNTIL and at COUNT', () => {
    const until = expandOccurrences(
      start,
      HOUR,
      'FREQ=DAILY;UNTIL=2026-09-09T09:00:00.000Z',
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(until).toHaveLength(3);

    const counted = expandOccurrences(
      start,
      HOUR,
      'FREQ=DAILY;COUNT=2',
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-10-01T00:00:00Z'),
    );
    expect(counted).toHaveLength(2);
  });

  it('clamps a monthly rule to the last valid day of short months', () => {
    const jan31 = new Date('2026-01-31T09:00:00.000Z');
    const hits = expandOccurrences(
      jan31,
      HOUR,
      'FREQ=MONTHLY',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-04-01T00:00:00Z'),
    );
    expect(iso(hits)).toEqual([
      '2026-01-31T09:00:00.000Z',
      '2026-02-28T09:00:00.000Z',
      '2026-03-31T09:00:00.000Z',
    ]);
  });

  it('finds occurrences of a long-running series far from its start', () => {
    const old = new Date('2020-01-06T09:00:00.000Z');
    const hits = expandOccurrences(
      old,
      HOUR,
      'FREQ=WEEKLY',
      new Date('2026-09-07T00:00:00Z'),
      new Date('2026-09-14T00:00:00Z'),
    );
    expect(iso(hits)).toEqual(['2026-09-07T09:00:00.000Z']);
  });

  it('includes an occurrence that started before the window but is still running', () => {
    const hits = expandOccurrences(
      start,
      4 * HOUR,
      'FREQ=DAILY',
      new Date('2026-09-07T10:00:00Z'),
      new Date('2026-09-07T11:00:00Z'),
    );
    expect(iso(hits)).toEqual(['2026-09-07T09:00:00.000Z']);
  });
});
