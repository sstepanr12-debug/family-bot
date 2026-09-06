import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../lib/httpError.js';
import { listFamiliesForUser, setColorPref } from '../services/familyService.js';
import { updateMeSchema } from '../services/schemas.js';

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(404, 'User not found');
    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        colorPref: user.colorPref,
      },
      families: await listFamiliesForUser(user.id),
    });
  } catch (err) {
    next(err);
  }
});

meRouter.patch('/', async (req, res, next) => {
  try {
    const { colorPref } = updateMeSchema.parse(req.body);
    const user = await setColorPref(req.userId!, colorPref);
    res.json({ id: user.id, colorPref: user.colorPref });
  } catch (err) {
    next(err);
  }
});
