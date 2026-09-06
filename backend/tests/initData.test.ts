import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InitDataError, validateInitData } from '../src/auth/initData.js';

const BOT_TOKEN = '123456:TEST-TOKEN';

function signInitData(fields: Record<string, string>) {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = { id: 42, first_name: 'Аня', username: 'anya' };

function fields(authDate: number) {
  return { auth_date: String(authDate), query_id: 'AAE', user: JSON.stringify(user) };
}

describe('validateInitData', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');
  const authDate = Math.floor(now.getTime() / 1000) - 60;

  it('accepts a correctly signed payload and returns the user', () => {
    const initData = signInitData(fields(authDate));
    const parsed = validateInitData(initData, BOT_TOKEN, { now });
    expect(parsed.id).toBe(42);
    expect(parsed.first_name).toBe('Аня');
  });

  it('rejects a payload whose fields were tampered with', () => {
    const initData = signInitData(fields(authDate)).replace('Aня', 'X');
    const tampered = initData.replace(/user=[^&]*/, `user=${encodeURIComponent(JSON.stringify({ ...user, id: 1 }))}`);
    expect(() => validateInitData(tampered, BOT_TOKEN, { now })).toThrow(InitDataError);
  });

  it('rejects a payload signed with a different bot token', () => {
    const initData = signInitData(fields(authDate));
    expect(() => validateInitData(initData, '999:OTHER', { now })).toThrow(InitDataError);
  });

  it('rejects a payload older than the freshness window', () => {
    const stale = Math.floor(now.getTime() / 1000) - 48 * 60 * 60;
    const initData = signInitData(fields(stale));
    expect(() => validateInitData(initData, BOT_TOKEN, { now })).toThrow(/expired/);
  });

  it('rejects a payload with no hash at all', () => {
    const initData = new URLSearchParams(fields(authDate)).toString();
    expect(() => validateInitData(initData, BOT_TOKEN, { now })).toThrow(/no hash/);
  });
});
