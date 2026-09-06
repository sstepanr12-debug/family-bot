import { z } from 'zod';

export const CATEGORIES = ['work', 'study', 'home', 'holiday', 'other'] as const;
export const COLOR_PREFS = ['author', 'category'] as const;

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

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
    category: z.enum(CATEGORIES).default('other'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
