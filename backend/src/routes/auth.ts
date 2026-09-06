import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { InitDataError, validateInitData, type TelegramUser } from '../auth/initData.js';
import { signSession } from '../auth/session.js';
import { HttpError } from '../lib/httpError.js';
import { listFamiliesForUser, upsertUserFromTelegram } from '../services/familyService.js';

const bodySchema = z.object({ initData: z.string().default('') });

/** Stand-in identity for browser development before a bot token exists. */
const DEV_USER: TelegramUser = {
  id: 100_000_001,
  first_name: 'Dev',
  last_name: 'User',
  username: 'devuser',
};

export const authRouter = Router();

authRouter.post('/telegram', async (req, res, next) => {
  try {
    const { initData } = bodySchema.parse(req.body ?? {});

    let tgUser: TelegramUser;
    if (env.hasBot) {
      try {
        tgUser = validateInitData(initData, env.BOT_TOKEN);
      } catch (err) {
        if (err instanceof InitDataError) throw new HttpError(401, err.message);
        throw err;
      }
    } else if (env.allowFakeUser) {
      // Optional ?dev=<n> lets a second browser tab act as a different member.
      const seat = Number(req.query.dev);
      tgUser = Number.isInteger(seat) && seat > 0
        ? { ...DEV_USER, id: DEV_USER.id + seat, first_name: `Dev ${seat}`, username: `devuser${seat}` }
        : DEV_USER;
    } else {
      throw new HttpError(503, 'Bot token is not configured');
    }

    const user = await upsertUserFromTelegram(tgUser);
    const families = await listFamiliesForUser(user.id);

    res.json({
      token: signSession({ userId: user.id }),
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        colorPref: user.colorPref,
      },
      families,
    });
  } catch (err) {
    next(err);
  }
});
