import { prisma } from '../db/client.js';
import { ensureDefaultCategories } from '../services/categoryService.js';

/** Old fixed labels mapped onto the seeded family categories. */
const LEGACY_TO_CATEGORY: Record<string, string> = {
  holiday: 'Семейные приятные дела',
  work: 'Семейные обязательные дела',
  study: 'Семейные обязательные дела',
  home: 'Семейные обязательные дела',
  other: 'Семейные обязательные дела',
};

/**
 * Gives every family its categories and moves events off the old string label
 * onto a real category. Idempotent: once an event has a categoryId it is left
 * alone, so this can run on every boot until the legacy column is dropped.
 */
export async function backfillCategories(): Promise<number> {
  const families = await prisma.family.findMany({ select: { id: true } });

  let moved = 0;
  for (const family of families) {
    await ensureDefaultCategories(family.id);

    const pending = await prisma.event.findMany({
      where: { familyId: family.id, categoryId: null },
      select: { id: true, category: true },
    });
    if (pending.length === 0) continue;

    const categories = await prisma.category.findMany({ where: { familyId: family.id } });
    const byName = new Map(categories.map((c) => [c.name, c.id]));

    for (const event of pending) {
      const targetName = LEGACY_TO_CATEGORY[event.category] ?? 'Семейные обязательные дела';
      const categoryId = byName.get(targetName);
      if (!categoryId) continue;

      await prisma.event.update({ where: { id: event.id }, data: { categoryId } });
      moved++;
    }
  }

  if (moved > 0) console.log(`[backfill] events moved to categories: ${moved}`);
  return moved;
}
