import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
  createCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from '../services/categoryService.js';
import {
  createCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
} from '../services/schemas.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth);

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const familyId = z.string().min(1).parse(req.query.familyId);
    const includeArchived = req.query.includeArchived === '1';
    res.json(await listCategories(req.userId!, familyId, includeArchived));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post('/', async (req, res, next) => {
  try {
    const familyId = z.string().min(1).parse(req.query.familyId ?? req.body?.familyId);
    const input = createCategorySchema.parse(req.body);
    res.status(201).json(await createCategory(req.userId!, familyId, input));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.patch('/:categoryId', async (req, res, next) => {
  try {
    const input = updateCategorySchema.parse(req.body);
    res.json(await updateCategory(req.userId!, req.params.categoryId, input));
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post('/reorder', async (req, res, next) => {
  try {
    const familyId = z.string().min(1).parse(req.query.familyId ?? req.body?.familyId);
    const { orderedIds } = reorderCategoriesSchema.parse(req.body);
    res.json(await reorderCategories(req.userId!, familyId, orderedIds));
  } catch (err) {
    next(err);
  }
});
