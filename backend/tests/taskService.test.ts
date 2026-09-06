import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db/client.js';
import { setHubForTesting } from '../src/realtime/hub.js';
import {
  ensureDefaultCategories,
  listCategories,
  createCategory,
  updateCategory,
  DEFAULT_CATEGORIES,
} from '../src/services/categoryService.js';
import {
  createTask,
  deleteTask,
  listTasks,
  tasksForRange,
  updateTask,
} from '../src/services/taskService.js';
import { createTaskSchema } from '../src/services/schemas.js';
import { taskRemindAt } from '../src/jobs/reminders.js';

vi.mock('../src/bot/bot.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(true),
  setWebhook: vi.fn().mockResolvedValue(true),
}));

const emitted: string[] = [];
setHubForTesting({
  to: () => ({
    emit: (type: string) => {
      emitted.push(type);
    },
  }),
} as never);

async function seed() {
  await prisma.taskReminderLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.eventException.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.category.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany();
  emitted.length = 0;

  const anya = await prisma.user.create({ data: { telegramId: '1', firstName: 'Аня' } });
  const oleg = await prisma.user.create({ data: { telegramId: '2', firstName: 'Олег' } });
  const outsider = await prisma.user.create({ data: { telegramId: '3', firstName: 'Чужой' } });

  const family = await prisma.family.create({
    data: {
      name: 'Дом',
      inviteCode: 'TASK2345',
      members: { create: [{ userId: anya.id, role: 'owner' }, { userId: oleg.id }] },
    },
  });
  const other = await prisma.family.create({
    data: { name: 'Другая', inviteCode: 'TASK9876', members: { create: { userId: outsider.id } } },
  });

  return { anya, oleg, outsider, family, other };
}

let ctx: Awaited<ReturnType<typeof seed>>;
beforeEach(async () => {
  ctx = await seed();
});

const NOW = new Date('2026-09-06T12:00:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function taskBody(familyId: string, over: Record<string, unknown> = {}) {
  return createTaskSchema.parse({ familyId, title: 'Оплатить квитанцию', ...over });
}

describe('ensureDefaultCategories', () => {
  it('creates the six family categories', async () => {
    await ensureDefaultCategories(ctx.family.id);
    const list = await listCategories(ctx.anya.id, ctx.family.id);
    expect(list.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(list.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c.color))).toBe(true);
  });

  it('does not duplicate them when called again', async () => {
    await ensureDefaultCategories(ctx.family.id);
    await ensureDefaultCategories(ctx.family.id);
    expect(await prisma.category.count({ where: { familyId: ctx.family.id } })).toBe(
      DEFAULT_CATEGORIES.length,
    );
  });

  it('seeds a family that existed before categories were introduced, on first read', async () => {
    expect(await prisma.category.count({ where: { familyId: ctx.family.id } })).toBe(0);
    const list = await listCategories(ctx.anya.id, ctx.family.id);
    expect(list).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('refuses a family the user does not belong to', async () => {
    await expect(listCategories(ctx.outsider.id, ctx.family.id)).rejects.toThrow(/not a member/);
  });
});

describe('categories', () => {
  it('renames and recolours without touching the rest', async () => {
    const [first] = await listCategories(ctx.anya.id, ctx.family.id);
    const updated = await updateCategory(ctx.anya.id, first.id, {
      name: 'Планы Стёпы',
      color: '#123456',
    });
    expect(updated.name).toBe('Планы Стёпы');
    expect(updated.color).toBe('#123456');
    expect(await prisma.category.count({ where: { familyId: ctx.family.id } })).toBe(6);
  });

  it('adds a new category at the end', async () => {
    await listCategories(ctx.anya.id, ctx.family.id);
    const created = await createCategory(ctx.anya.id, ctx.family.id, {
      name: 'Дача',
      color: '#00AA88',
    });
    const list = await listCategories(ctx.anya.id, ctx.family.id);
    expect(list.at(-1)?.id).toBe(created.id);
  });

  it('archives a category but keeps it out of the default list', async () => {
    const list = await listCategories(ctx.anya.id, ctx.family.id);
    await updateCategory(ctx.anya.id, list[0].id, { archived: true });

    expect(await listCategories(ctx.anya.id, ctx.family.id)).toHaveLength(5);
    expect(await listCategories(ctx.anya.id, ctx.family.id, true)).toHaveLength(6);
  });

  it('refuses to archive the last remaining category', async () => {
    const list = await listCategories(ctx.anya.id, ctx.family.id);
    for (const category of list.slice(0, 5)) {
      await updateCategory(ctx.anya.id, category.id, { archived: true });
    }
    await expect(
      updateCategory(ctx.anya.id, list[5].id, { archived: true }),
    ).rejects.toThrow(/последнюю/);
  });
});

describe('createTask', () => {
  it('stores a deadline as a whole day and broadcasts it', async () => {
    const dto = await createTask(
      ctx.anya.id,
      taskBody(ctx.family.id, { dueDate: '2026-09-09' }),
    );
    expect(dto.dueDate).toBe('2026-09-09T00:00:00.000Z');
    expect(dto.done).toBe(false);
    expect(emitted).toContain('task:created');
  });

  it('accepts a task with no deadline at all', async () => {
    const dto = await createTask(ctx.anya.id, taskBody(ctx.family.id, { title: 'Когда-нибудь' }));
    expect(dto.dueDate).toBeNull();
  });

  it('refuses a family the user does not belong to', async () => {
    await expect(createTask(ctx.outsider.id, taskBody(ctx.family.id))).rejects.toThrow(
      /not a member/,
    );
  });

  it('refuses a category from another family', async () => {
    await ensureDefaultCategories(ctx.other.id);
    const foreign = await prisma.category.findFirst({ where: { familyId: ctx.other.id } });
    await expect(
      createTask(ctx.anya.id, taskBody(ctx.family.id, { categoryId: foreign!.id })),
    ).rejects.toThrow(/другой семье/);
  });

  it('refuses an assignee from outside the family', async () => {
    await expect(
      createTask(ctx.anya.id, taskBody(ctx.family.id, { assigneeId: ctx.outsider.id })),
    ).rejects.toThrow(/не состоит/);
  });
});

describe('tasksForRange', () => {
  it('returns a task due inside the requested week', async () => {
    await createTask(ctx.anya.id, taskBody(ctx.family.id, { dueDate: '2026-09-09' }));
    const week = await tasksForRange(
      ctx.oleg.id,
      ctx.family.id,
      day('2026-09-07'),
      day('2026-09-14'),
      NOW,
    );
    expect(week.map((t) => t.title)).toEqual(['Оплатить квитанцию']);
  });

  it('keeps an overdue open task visible outside its own week', async () => {
    await createTask(ctx.anya.id, taskBody(ctx.family.id, { dueDate: '2026-08-30' }));
    const week = await tasksForRange(
      ctx.anya.id,
      ctx.family.id,
      day('2026-09-07'),
      day('2026-09-14'),
      NOW,
    );
    expect(week).toHaveLength(1);
    expect(week[0].overdue).toBe(true);
  });

  it('drops an overdue task once it is done', async () => {
    const task = await createTask(ctx.anya.id, taskBody(ctx.family.id, { dueDate: '2026-08-30' }));
    await updateTask(ctx.anya.id, task.id, { done: true });

    const week = await tasksForRange(
      ctx.anya.id,
      ctx.family.id,
      day('2026-09-07'),
      day('2026-09-14'),
      NOW,
    );
    expect(week).toEqual([]);
  });

  it('does not leak tasks of another family', async () => {
    await createTask(ctx.anya.id, taskBody(ctx.family.id, { dueDate: '2026-09-09' }));
    await expect(
      tasksForRange(ctx.outsider.id, ctx.family.id, day('2026-09-07'), day('2026-09-14'), NOW),
    ).rejects.toThrow(/not a member/);
  });
});

describe('updateTask', () => {
  it('records who completed it and when', async () => {
    const task = await createTask(ctx.anya.id, taskBody(ctx.family.id, { dueDate: '2026-09-09' }));
    const done = await updateTask(ctx.oleg.id, task.id, { done: true });

    expect(done.done).toBe(true);
    expect(done.completedBy?.firstName).toBe('Олег');
    expect(done.completedAt).not.toBeNull();
    expect(emitted.at(-1)).toBe('task:updated');
  });

  it('clears completion when reopened', async () => {
    const task = await createTask(ctx.anya.id, taskBody(ctx.family.id));
    await updateTask(ctx.anya.id, task.id, { done: true });
    const reopened = await updateTask(ctx.anya.id, task.id, { done: false });

    expect(reopened.done).toBe(false);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.completedBy).toBeNull();
  });
});

describe('listTasks and delete', () => {
  it('hides a soft-deleted task', async () => {
    const task = await createTask(ctx.anya.id, taskBody(ctx.family.id));
    await deleteTask(ctx.anya.id, task.id);

    expect(await listTasks(ctx.anya.id, ctx.family.id, NOW)).toEqual([]);
    const row = await prisma.task.findUnique({ where: { id: task.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('drops tasks finished more than a week ago', async () => {
    const task = await createTask(ctx.anya.id, taskBody(ctx.family.id));
    await prisma.task.update({
      where: { id: task.id },
      data: { done: true, completedAt: new Date('2026-08-01T10:00:00.000Z') },
    });
    expect(await listTasks(ctx.anya.id, ctx.family.id, NOW)).toEqual([]);
  });
});

describe('taskRemindAt', () => {
  it('fires on the morning of the deadline in the family timezone', () => {
    // Moscow is UTC+3, so 09:00 local on the 9th is 06:00 UTC.
    const at = taskRemindAt(day('2026-09-09'), 'morning', 'Europe/Moscow');
    expect(at?.toISOString()).toBe('2026-09-09T06:00:00.000Z');
  });

  it('shifts a day and a week earlier for the other modes', () => {
    expect(taskRemindAt(day('2026-09-09'), 'dayBefore', 'Europe/Moscow')?.toISOString()).toBe(
      '2026-09-08T06:00:00.000Z',
    );
    expect(taskRemindAt(day('2026-09-09'), 'weekBefore', 'Europe/Moscow')?.toISOString()).toBe(
      '2026-09-02T06:00:00.000Z',
    );
  });

  it('respects a different timezone', () => {
    expect(taskRemindAt(day('2026-09-09'), 'morning', 'UTC')?.toISOString()).toBe(
      '2026-09-09T09:00:00.000Z',
    );
  });
});
