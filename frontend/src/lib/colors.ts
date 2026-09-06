import type { CalendarEvent, Category, ColorPref } from '../api/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  work: 'Работа',
  study: 'Учёба',
  home: 'Быт',
  holiday: 'Праздник',
  other: 'Другое',
};

const CATEGORY_COLORS: Record<Category, string> = {
  work: '#4C6FFF',
  study: '#8B5CF6',
  home: '#10B981',
  holiday: '#F59E0B',
  other: '#6B7280',
};

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
  return pref === 'author' ? authorColor(event.author.id) : CATEGORY_COLORS[event.category];
}

export const categoryColor = (category: Category) => CATEGORY_COLORS[category];

export function initials(firstName: string, lastName?: string | null): string {
  return `${firstName.charAt(0)}${lastName?.charAt(0) ?? ''}`.toUpperCase();
}
