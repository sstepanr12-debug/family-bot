import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { createEvent, deleteEvent, listEvents, updateEvent } from '../services/eventService.js';
import {
  createEventSchema,
  rangeSchema,
  scopeSchema,
  updateEventSchema,
} from '../services/schemas.js';

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

const occurrenceQuery = z.object({
  scope: scopeSchema,
  occurrenceStart: z
    .string()
    .datetime({ offset: true })
    .transform((s) => new Date(s))
    .optional(),
});

eventsRouter.get('/', async (req, res, next) => {
  try {
    const familyId = z.string().min(1).parse(req.query.familyId);
    const { from, to } = rangeSchema.parse(req.query);
    res.json(await listEvents(req.userId!, familyId, from, to));
  } catch (err) {
    next(err);
  }
});

eventsRouter.post('/', async (req, res, next) => {
  try {
    const input = createEventSchema.parse(req.body);
    res.status(201).json(await createEvent(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

eventsRouter.patch('/:eventId', async (req, res, next) => {
  try {
    const input = updateEventSchema.parse(req.body);
    const { scope, occurrenceStart } = occurrenceQuery.parse(req.query);
    res.json(await updateEvent(req.userId!, req.params.eventId, input, scope, occurrenceStart));
  } catch (err) {
    next(err);
  }
});

eventsRouter.delete('/:eventId', async (req, res, next) => {
  try {
    const { scope, occurrenceStart } = occurrenceQuery.parse(req.query);
    await deleteEvent(req.userId!, req.params.eventId, scope, occurrenceStart);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
