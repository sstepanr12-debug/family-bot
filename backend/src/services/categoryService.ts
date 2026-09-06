import type { Category } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../lib/httpError.js';
import { assertMember } from '../auth/middleware.js';
import { emitToFamily } from '../realtime/hub.js';

/**
 * Categories a family starts with. They are seeded once and fully editable
 * afterwards — renaming a person or adding one must never require a code change.
 */
export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Планы Степа', color: '#4C6FFF' },
  { name: 'Планы Аня', color: '#EC4899' },
  { name: 'Планы Вероника', color: '#8B5CF6' },
  { name: 'Планы Катя', color: '#F59E0B' },
  { name: 'Семейные обязательные дела', color: '#EF4444' },
  { name: 'Семейные приятные дела', color: '#10B981' },
];

/** Colour shown for anything without a category. */
export const NO_CATEGORY_COLOR = '#6B7280';

export function toCategoryDto(category: Category) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    sortOrder: category.sortOrder,
    archived: category.archivedAt !== null,
  };
}

export type CategoryDto = ReturnType<typeof toCategoryDto>;

/**
 * Creates the default set the first time a family needs categories. Safe to call
 * on every read: families created before this feature existed get their
 * categories on first open, with no manual migration step.
 */
export async function ensureDefaultCategories(familyId: string): Promise<void> {
  const existing = await prisma.category.count({ where: { familyId } });
  if (existing > 0) return;

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category, index) => ({
      familyId,
      name: category.name,
      color: category.color,
      sortOrder: index,
    })),
  });
}

export async function listCategories(
  userId: string,
  familyId: string,
  includeArchived = false,
): Promise<CategoryDto[]> {
  await assertMember(userId, familyId);
  await ensureDefaultCategories(familyId);

  const categories = await prisma.category.findMany({
    where: { familyId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return categories.map(toCategoryDto);
}

async function loadOwned(userId: string, categoryId: string): Promise<Category> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new HttpError(404, 'Category not found');
  await assertMember(userId, category.familyId);
  return category;
}

export async function createCategory(
  userId: string,
  familyId: string,
  input: { name: string; color: string },
): Promise<CategoryDto> {
  await assertMember(userId, familyId);

  const last = await prisma.category.findFirst({
    where: { familyId },
    orderBy: { sortOrder: 'desc' },
  });

  const created = await prisma.category.create({
    data: {
      familyId,
      name: input.name,
      color: input.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  emitToFamily(familyId, { type: 'category:changed' });
  return toCategoryDto(created);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: { name?: string; color?: string; sortOrder?: number; archived?: boolean },
): Promise<CategoryDto> {
  const category = await loadOwned(userId, categoryId);

  if (input.archived === true && category.archivedAt === null) {
    const active = await prisma.category.count({
      where: { familyId: category.familyId, archivedAt: null },
    });
    // Leaving a family with no categories at all would make the pickers empty.
    if (active <= 1) throw new HttpError(400, 'Нельзя убрать последнюю категорию');
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });

  emitToFamily(category.familyId, { type: 'category:changed' });
  return toCategoryDto(updated);
}

/**
 * Reorders the whole list in one call, which is what a drag-and-drop UI needs.
 * Ids from another family are ignored rather than trusted.
 */
export async function reorderCategories(
  userId: string,
  familyId: string,
  orderedIds: string[],
): Promise<CategoryDto[]> {
  await assertMember(userId, familyId);

  const owned = await prisma.category.findMany({ where: { familyId }, select: { id: true } });
  const ownedIds = new Set(owned.map((c) => c.id));

  await prisma.$transaction(
    orderedIds
      .filter((id) => ownedIds.has(id))
      .map((id, index) =>
        prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
  );

  emitToFamily(familyId, { type: 'category:changed' });
  return listCategories(userId, familyId);
}
