import type { CalendarEvent, ColorPref, EventDraft, Family, Me, Member } from './types';

/** Empty = same origin: the backend serves this bundle and the API together. */
const BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'fc.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearToken();
    throw new ApiError(res.status, payload.error ?? `Ошибка запроса (${res.status})`);
  }
  return payload as T;
}

interface AuthResponse {
  token: string;
  user: Me;
  families: Family[];
}

/**
 * Exchanges Telegram initData for a session token. `devSeat` picks a distinct
 * fake identity when the backend runs without a bot token.
 */
export async function login(initData: string, devSeat?: number): Promise<AuthResponse> {
  const query = devSeat ? `?dev=${devSeat}` : '';
  const auth = await request<AuthResponse>(`/api/auth/telegram${query}`, {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
  setToken(auth.token);
  return auth;
}

export const fetchMe = () => request<{ user: Me; families: Family[] }>('/api/me');

export const setColorPref = (colorPref: ColorPref) =>
  request<{ id: string; colorPref: ColorPref }>('/api/me', {
    method: 'PATCH',
    body: JSON.stringify({ colorPref }),
  });

export const createFamily = (name: string, timezone?: string) =>
  request<Family>('/api/families', { method: 'POST', body: JSON.stringify({ name, timezone }) });

export const joinFamily = (inviteCode: string) =>
  request<Family>('/api/families/join', { method: 'POST', body: JSON.stringify({ inviteCode }) });

export const fetchMembers = (familyId: string) =>
  request<Member[]>(`/api/families/${familyId}/members`);

export const regenerateInvite = (familyId: string) =>
  request<Family>(`/api/families/${familyId}/invite`, { method: 'POST' });

export const fetchEvents = (familyId: string, from: Date, to: Date) =>
  request<CalendarEvent[]>(
    `/api/events?familyId=${familyId}&from=${from.toISOString()}&to=${to.toISOString()}`,
  );

export const createEvent = (familyId: string, draft: EventDraft) =>
  request<CalendarEvent>('/api/events', {
    method: 'POST',
    body: JSON.stringify({ familyId, ...draft }),
  });

export const updateEvent = (
  eventId: string,
  draft: Partial<EventDraft>,
  scope: 'this' | 'all',
  occurrenceStart?: string,
) =>
  request<CalendarEvent>(
    `/api/events/${eventId}?scope=${scope}` +
      (occurrenceStart ? `&occurrenceStart=${encodeURIComponent(occurrenceStart)}` : ''),
    { method: 'PATCH', body: JSON.stringify(draft) },
  );

export const deleteEvent = (eventId: string, scope: 'this' | 'all', occurrenceStart?: string) =>
  request<void>(
    `/api/events/${eventId}?scope=${scope}` +
      (occurrenceStart ? `&occurrenceStart=${encodeURIComponent(occurrenceStart)}` : ''),
    { method: 'DELETE' },
  );
