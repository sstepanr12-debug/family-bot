import { env } from '../config/env.js';

const API = 'https://api.telegram.org';

/**
 * Sends a Telegram message. Without a BOT_TOKEN this is a logged no-op so the
 * app stays fully usable before the bot is registered in BotFather.
 */
export async function sendMessage(chatId: string, text: string): Promise<boolean> {
  if (!env.hasBot) {
    console.info(`[bot:noop] -> ${chatId}: ${text.replace(/\n/g, ' | ')}`);
    return false;
  }
  try {
    const res = await fetch(`${API}/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.warn(`[bot] sendMessage failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    // A user who never started the bot, or a network blip, must not break the API call.
    console.warn('[bot] sendMessage error', err);
    return false;
  }
}

/** Registers the update webhook with Telegram. */
export async function setWebhook(url: string): Promise<boolean> {
  if (!env.hasBot) return false;
  try {
    const res = await fetch(`${API}/bot${env.BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, allowed_updates: ['message'] }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[bot] setWebhook error', err);
    return false;
  }
}
