import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  createFamily,
  joinFamily,
  listFamiliesForUser,
  listMembers,
  regenerateInviteCode,
} from '../services/familyService.js';
import { createFamilySchema, joinFamilySchema } from '../services/schemas.js';

export const familiesRouter = Router();

familiesRouter.use(requireAuth);

familiesRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listFamiliesForUser(req.userId!));
  } catch (err) {
    next(err);
  }
});

familiesRouter.post('/', async (req, res, next) => {
  try {
    const input = createFamilySchema.parse(req.body);
    res.status(201).json(await createFamily(req.userId!, input.name, input.timezone));
  } catch (err) {
    next(err);
  }
});

familiesRouter.post('/join', async (req, res, next) => {
  try {
    const { inviteCode } = joinFamilySchema.parse(req.body);
    res.json(await joinFamily(req.userId!, inviteCode));
  } catch (err) {
    next(err);
  }
});

familiesRouter.get('/:familyId/members', async (req, res, next) => {
  try {
    res.json(await listMembers(req.userId!, req.params.familyId));
  } catch (err) {
    next(err);
  }
});

familiesRouter.post('/:familyId/invite', async (req, res, next) => {
  try {
    res.json(await regenerateInviteCode(req.userId!, req.params.familyId));
  } catch (err) {
    next(err);
  }
});
