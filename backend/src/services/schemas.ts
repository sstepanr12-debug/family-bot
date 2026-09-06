import { z } from 'zod';

export const COLOR_PREFS = ['author', 'category'] as const;
export const REMIND_MODES = ['morning', 'dayBefore', 'weekBefore'] as const;

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

/** A deadline is a day, not a moment: accept "2026-09-09" as well as a full ISO. */
const dueDate = z
  .string()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Invalid date')
  .transform((s) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00.000Z` : s));

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must look like #4C6FFF');

export const rruleSchema = z
  .string()
  .regex(
    /^FREQ=(DAILY|WEEKLY|MONTHLY)(;(INTERVAL=\d+|UNTIL=[^;]+|COUNT=\d+))*$/,
    'Unsupported recurrence rule',
  );

export const createEventSchema = z
  .object({
    familyId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    allDay: z.boolean().default(false),
    categoryId: z.string().min(1).nullish(),
    color: hexColor.optional(),
    participantIds: z.array(z.string().min(1)).default([]),
    rrule: rruleSchema.nullish(),
    reminderMinutes: z.number().int().min(0).max(60 * 24 * 7).nullish(),
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: 'endsAt must not be before startsAt',
    path: ['endsAt'],
  });

export const updateEventSchema = createEventSchema
  .innerType()
  .omit({ familyId: true })
  .partial()
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, {
    message: 'endsAt must not be before startsAt',
    path: ['endsAt'],
  });

export const rangeSchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const createFamilySchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const joinFamilySchema = z.object({
  inviteCode: z.string().trim().min(4).max(32),
});

export const updateMeSchema = z.object({
  colorPref: z.enum(COLOR_PREFS),
});

/** `this` edits/removes a single occurrence, `all` the whole series. */
export const scopeSchema = z.enum(['this', 'all']).default('all');

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColor,
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    color: hexColor,
    sortOrder: z.number().int().min(0),
    archived: z.boolean(),
  })
  .partial();

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const createTaskSchema = z.object({
  familyId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullish(),
  dueDate: dueDate.nullish(),
  categoryId: z.string().min(1).nullish(),
  assigneeId: z.string().min(1).nullish(),
  remindMode: z.enum(REMIND_MODES).nullish(),
});

export const updateTaskSchema = createTaskSchema
  .omit({ familyId: true })
  .partial()
  .extend({ done: z.boolean().optional() });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
