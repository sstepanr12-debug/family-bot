import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { createTask, deleteTask, listTasks, tasksForRange, updateTask } from '../services/taskService.js';
import { createTaskSchema, rangeSchema, updateTaskSchema } from '../services/schemas.js';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get('/', async (req, res, next) => {
  try {
    const familyId = z.string().min(1).parse(req.query.familyId);
    // With a range the calendar is asking; without one it is the to-do list.
    if (req.query.from && req.query.to) {
      const { from, to } = rangeSchema.parse(req.query);
      return res.json(await tasksForRange(req.userId!, familyId, from, to));
    }
    res.json(await listTasks(req.userId!, familyId));
  } catch (err) {
    next(err);
  }
});

tasksRouter.post('/', async (req, res, next) => {
  try {
    const input = createTaskSchema.parse(req.body);
    res.status(201).json(await createTask(req.userId!, input));
  } catch (err) {
    next(err);
  }
});

tasksRouter.patch('/:taskId', async (req, res, next) => {
  try {
    const input = updateTaskSchema.parse(req.body);
    res.json(await updateTask(req.userId!, req.params.taskId, input));
  } catch (err) {
    next(err);
  }
});

tasksRouter.delete('/:taskId', async (req, res, next) => {
  try {
    await deleteTask(req.userId!, req.params.taskId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
