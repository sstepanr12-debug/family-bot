import type { CalendarEvent, ColorPref, Task } from '../api/types';

/** Shown for anything the family has not put in a category. */
export const NO_CATEGORY_COLOR = '#6B7280';

/** Choices offered when creating or recolouring a category. */
export const CATEGORY_PALETTE = [
  '#4C6FFF',
  '#EC4899',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#10B981',
  '#0EA5E9',
  '#14B8A6',
  '#F97316',
  '#6B7280',
];

/** Stable per-author palette: same person keeps the same colour everywhere. */
const AUTHOR_COLORS = ['#4C6FFF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#EC4899'];

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function authorColor(userId: string): string {
  return AUTHOR_COLORS[hashCode(userId) % AUTHOR_COLORS.length];
}

export function eventColor(event: CalendarEvent, pref: ColorPref): string {
  if (event.color) return event.color;
  if (pref === 'author') return authorColor(event.author.id);
  return event.category?.color ?? NO_CATEGORY_COLOR;
}

export const taskColor = (task: Task): string => task.category?.color ?? NO_CATEGORY_COLOR;

export function initials(firstName: string, lastName?: string | null): string {
  return `${firstName.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase();
}
