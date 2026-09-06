import crypto from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export class InitDataError extends Error {}

/** Default freshness window for auth_date, per Telegram's guidance. */
export const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies a Telegram Mini App `initData` query string and returns its user.
 * Throws InitDataError when the signature, shape or age is wrong.
 */
export function validateInitData(
  initData: string,
  botToken: string,
  opts: { now?: Date; maxAgeSeconds?: number } = {},
): TelegramUser {
  if (!botToken) throw new InitDataError('Bot token is not configured');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('initData has no hash');

  params.delete('hash');
  // signature is present on newer clients and is excluded from the check string
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const given = Buffer.from(hash, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    throw new InitDataError('initData signature does not match');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) throw new InitDataError('initData has no auth_date');
  const nowSeconds = Math.floor((opts.now?.getTime() ?? Date.now()) / 1000);
  const maxAge = opts.maxAgeSeconds ?? MAX_AUTH_AGE_SECONDS;
  if (nowSeconds - authDate > maxAge) throw new InitDataError('initData has expired');

  const rawUser = params.get('user');
  if (!rawUser) throw new InitDataError('initData has no user');

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser);
  } catch {
    throw new InitDataError('initData user is not valid JSON');
  }
  if (typeof user?.id !== 'number' || typeof user?.first_name !== 'string') {
    throw new InitDataError('initData user is missing required fields');
  }

  return user;
}
