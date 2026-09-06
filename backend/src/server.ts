import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { initHub } from './realtime/hub.js';
import { startReminderScheduler } from './jobs/reminders.js';
import { registerWebhook } from './bot/webhook.js';
import { backfillCategories } from './jobs/backfill.js';

const server = createServer(createApp());
initHub(server);
startReminderScheduler();

server.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT}`);
  void registerWebhook();
  void backfillCategories().catch((err) => console.error('[backfill] failed', err));
  if (!env.hasBot) {
    console.log('[api] BOT_TOKEN is empty — Telegram messages are disabled' +
      (env.allowFakeUser ? ', dev login is enabled' : ''));
  }
});
