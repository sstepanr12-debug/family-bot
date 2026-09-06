export type ColorPref = 'author' | 'category';
export type RemindMode = 'morning' | 'dayBefore' | 'weekBefore';

/** A family-owned, editable label with a colour. */
export interface Category {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

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
  category: Category | null;
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
  categoryId: string | null;
  participantIds: string[];
  rrule: string | null;
  reminderMinutes: number | null;
}

/** Something to do by a deadline, with no time of day. */
export interface Task {
  id: string;
  familyId: string;
  title: string;
  notes: string | null;
  /** UTC midnight of the due day, or null for "someday". */
  dueDate: string | null;
  category: Category | null;
  assignee: Person | null;
  done: boolean;
  completedAt: string | null;
  completedBy: Person | null;
  remindMode: RemindMode | null;
  createdBy: Person;
  updatedAt: string;
  /** Past its deadline and still open. */
  overdue: boolean;
}

export interface TaskDraft {
  title: string;
  notes?: string | null;
  dueDate: string | null;
  categoryId: string | null;
  assigneeId: string | null;
  remindMode: RemindMode | null;
}
