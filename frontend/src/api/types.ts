export type Category = 'work' | 'study' | 'home' | 'holiday' | 'other';
export type ColorPref = 'author' | 'category';

export interface Person {
  id: string;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
}

export interface Member extends Person {
  username: string | null;
  role: string;
}

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  timezone: string;
  role?: string;
}

export interface Me extends Person {
  username: string | null;
  colorPref: ColorPref;
}

export interface CalendarEvent {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  occurrenceStart: string;
  seriesStart: string;
  allDay: boolean;
  category: Category;
  color: string | null;
  rrule: string | null;
  reminderMinutes: number | null;
  author: Person;
  updatedBy: Person | null;
  updatedAt: string;
  participants: Person[];
  isRecurring: boolean;
}

export interface EventDraft {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  category: Category;
  participantIds: string[];
  rrule: string | null;
  reminderMinutes: number | null;
}
