/** Date helpers working in the viewer's local timezone; the API speaks UTC ISO. */

export const DAY_MS = 86_400_000;

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday-based week start, matching the Russian calendar convention. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const isToday = (date: Date) => isSameDay(date, new Date());

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const monthOnlyFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long' });

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));
export const formatDay = (date: Date) => dayFmt.format(date);
/** "сентябрь 2026" — built by hand so the Russian locale's "г." suffix is left out. */
export const formatMonth = (date: Date) => `${monthOnlyFmt.format(date)} ${date.getFullYear()}`;

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startPart = sameMonth
    ? String(weekStart.getDate())
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(weekStart);
  return `${startPart} – ${dayFmt.format(end)}`;
}

/** `<input type="datetime-local">` needs a local, timezone-free string. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const fromLocalInput = (value: string): Date => new Date(value);

export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
