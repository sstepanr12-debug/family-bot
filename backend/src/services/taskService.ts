import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { HttpError } from '../lib/httpError.js';
import { assertMember } from '../auth/middleware.js';
import { emitToFamily } from '../realtime/hub.js';
import { toCategoryDto } from './categoryService.js';
import type { CreateTaskInput, UpdateTaskInput } from './schemas.js';

const taskInclude = {
  category: true,
  assignee: true,
  createdBy: true,
  completedBy: true,
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

interface Person {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}

const personDto = (user: Person) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  photoUrl: user.photoUrl,
});

/** Midnight UTC of the day a date falls on — tasks are day-precision. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toTaskDto(task: TaskWithRelations, now = new Date()) {
  const due = task.dueDate;
  return {
    id: task.id,
    familyId: task.familyId,
    title: task.title,
    notes: task.notes,
    dueDate: due ? due.toISOString() : null,
    category: task.category ? toCategoryDto(task.category) : null,
    assignee: task.assignee ? personDto(task.assignee) : null,
    done: task.done,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    completedBy: task.completedBy ? personDto(task.completedBy) : null,
    remindMode: task.remindMode,
    createdBy: personDto(task.createdBy),
    updatedAt: task.updatedAt.toISOString(),
    /** Past its deadline and still open — the client shows these first. */
    overdue: Boolean(due && !task.done && due < startOfUtcDay(now)),
  };
}

export type TaskDto = ReturnType<typeof toTaskDto>;

async function loadTask(taskId: string): Promise<TaskWithRelations> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: taskInclude,
  });
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

/** A category may only be attached to a task of the family that owns it. */
async function assertCategoryInFamily(familyId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.familyId !== familyId) {
    throw new HttpError(400, 'Категория принадлежит другой семье');
  }
}

async function assertAssigneeInFamily(familyId: string, userId: string | null | undefined) {
  if (!userId) return;
  const membership = await prisma.membership.findUnique({
    where: { userId_familyId: { userId, familyId } },
  });
  if (!membership) throw new HttpError(400, 'Исполнитель не состоит в этой семье');
}

/** How long a finished task stays visible before it drops out of the list. */
const DONE_VISIBLE_DAYS = 7;

export async function listTasks(userId: string, familyId: string, now = new Date()): Promise<TaskDto[]> {
  await assertMember(userId, familyId);

  const doneSince = new Date(now.getTime() - DONE_VISIBLE_DAYS * 86_400_000);
  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      deletedAt: null,
      // Open tasks always; finished ones only while they are still recent, so
      // the list does not grow forever.
      OR: [{ done: false }, { done: true, completedAt: { gte: doneSince } }],
    },
    include: taskInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });

  return tasks.map((task) => toTaskDto(task, now));
}

/**
 * Tasks the calendar needs for a visible range: those due inside it, plus every
 * overdue open task — the calendar pins those to today so a missed deadline
 * stays in sight instead of sinking into the past.
 */
export async function tasksForRange(
  userId: string,
  familyId: string,
  from: Date,
  to: Date,
  now = new Date(),
): Promise<TaskDto[]> {
  await assertMember(userId, familyId);

  const tasks = await prisma.task.findMany({
    where: {
      familyId,
      deletedAt: null,
      OR: [
        { dueDate: { gte: from, lt: to } },
        { done: false, dueDate: { lt: startOfUtcDay(now) } },
      ],
    },
    include: taskInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });

  return tasks.map((task) => toTaskDto(task, now));
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<TaskDto> {
  await assertMember(userId, input.familyId);
  await assertCategoryInFamily(input.familyId, input.categoryId);
  await assertAssigneeInFamily(input.familyId, input.assigneeId);

  const created = await prisma.task.create({
    data: {
      familyId: input.familyId,
      title: input.title,
      notes: input.notes ?? null,
      dueDate: input.dueDate ? startOfUtcDay(input.dueDate) : null,
      categoryId: input.categoryId ?? null,
      assigneeId: input.assigneeId ?? null,
      remindMode: input.remindMode ?? null,
      createdById: userId,
    },
    include: taskInclude,
  });

  const dto = toTaskDto(created);
  emitToFamily(created.familyId, { type: 'task:created', task: dto });
  return dto;
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<TaskDto> {
  const task = await loadTask(taskId);
  await assertMember(userId, task.familyId);
  await assertCategoryInFamily(task.familyId, input.categoryId);
  await assertAssigneeInFamily(task.familyId, input.assigneeId);

  // Completion is tracked with who and when, so the list can show it.
  const completion =
    input.done === undefined || input.done === task.done
      ? {}
      : input.done
        ? { done: true, completedAt: new Date(), completedById: userId }
        : { done: false, completedAt: null, completedById: null };

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.dueDate !== undefined
        ? { dueDate: input.dueDate ? startOfUtcDay(input.dueDate) : null }
        : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId ?? null } : {}),
      ...(input.remindMode !== undefined ? { remindMode: input.remindMode ?? null } : {}),
      ...completion,
    },
    include: taskInclude,
  });

  const dto = toTaskDto(updated);
  emitToFamily(updated.familyId, { type: 'task:updated', task: dto });
  return dto;
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const task = await loadTask(taskId);
  await assertMember(userId, task.familyId);

  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
  emitToFamily(task.familyId, { type: 'task:deleted', taskId });
}
