import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  JWT_SECRET: z.string().min(1).default('dev-secret-change-me'),
  BOT_TOKEN: z.string().default(''),
  DEV_FAKE_USER: z
    .string()
    .default('0')
    .transform((v) => v === '1' || v.toLowerCase() === 'true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Public HTTPS address of this deployment; used to register the bot webhook. */
  PUBLIC_URL: z.string().default(''),
  /** Secret path segment proving an incoming update really came from Telegram. */
  WEBHOOK_SECRET: z.string().min(8).default('local-dev-webhook-secret'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: [
    ...parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()),
    // The deployment's own address: harmless when the app is served from here,
    // needed when a tunnel or CDN sits in front.
    parsed.data.PUBLIC_URL.replace(/\/$/, ''),
  ].filter(Boolean),
  get isProd() {
    return parsed.data.NODE_ENV === 'production';
  },
  /** Telegram features (initData check, bot messages) need a token. */
  get hasBot() {
    return parsed.data.BOT_TOKEN.length > 0;
  },
  /** Accept an unsigned dev login — never in production. */
  get allowFakeUser() {
    return parsed.data.DEV_FAKE_USER && parsed.data.NODE_ENV !== 'production';
  },
};

if (env.isProd && !env.hasBot) {
  console.error('BOT_TOKEN is required when NODE_ENV=production');
  process.exit(1);
}
