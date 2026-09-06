import { Router } from 'express';
import { env } from '../config/env.js';
import { sendMessage, setWebhook } from './bot.js';

/**
 * Telegram pushes updates here instead of us polling: on a sleep-capable free
 * host an incoming update also wakes the service.
 *
 * The secret path segment is what proves an update really came from Telegram
 * (it is set together with the webhook URL and never leaves our config).
 */
export const botRouter = Router();

const WELCOME =
  'Привет! Это семейный календарь.\n\n' +
  'Открывай его кнопкой меню слева от поля ввода — там общее расписание семьи. ' +
  'Уведомления о новых событиях и напоминания буду присылать сюда.';

botRouter.post(`/webhook/${env.WEBHOOK_SECRET}`, async (req, res) => {
  // Always 200: Telegram retries anything else, and a failed reply is not worth
  // a retry storm.
  res.sendStatus(200);

  const message = req.body?.message;
  const text: string | undefined = message?.text;
  const chatId = message?.chat?.id;
  if (!chatId || typeof text !== 'string') return;

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendMessage(String(chatId), WELCOME);
  }
});

/**
 * Points Telegram at this deployment. Called on boot when PUBLIC_URL is known;
 * without it (local dev) the bot simply receives no updates.
 */
export async function registerWebhook(): Promise<void> {
  if (!env.hasBot || !env.PUBLIC_URL) return;
  const url = `${env.PUBLIC_URL.replace(/\/$/, '')}/api/bot/webhook/${env.WEBHOOK_SECRET}`;
  const ok = await setWebhook(url);
  console.log(ok ? `[bot] webhook set to ${url}` : '[bot] failed to set webhook');
}
