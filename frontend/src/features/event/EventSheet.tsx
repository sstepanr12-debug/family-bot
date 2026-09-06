import { useState } from 'react';
import type { CalendarEvent, Category, EventDraft, Member } from '../../api/types';
import { fromLocalInput, toLocalInput } from '../../lib/dates';
import { Sheet } from '../../ui/Sheet';

const REPEATS = [
  { value: '', label: 'Не повторять' },
  { value: 'FREQ=DAILY', label: 'Каждый день' },
  { value: 'FREQ=WEEKLY', label: 'Каждую неделю' },
  { value: 'FREQ=MONTHLY', label: 'Каждый месяц' },
];

const REMINDERS = [
  { value: '', label: 'Без напоминания' },
  { value: '10', label: 'За 10 минут' },
  { value: '30', label: 'За 30 минут' },
  { value: '60', label: 'За час' },
  { value: '1440', label: 'За день' },
];

interface Props {
  /** Existing occurrence to edit, or null when creating. */
  event: CalendarEvent | null;
  defaultDay: Date;
  categories: Category[];
  members: Member[];
  saving: boolean;
  error: string | null;
  onSave(draft: EventDraft, scope: 'this' | 'all'): void;
  onDelete(scope: 'this' | 'all'): void;
  onClose(): void;
}

function initialState(event: CalendarEvent | null, defaultDay: Date) {
  if (event) {
    return {
      title: event.title,
      description: event.description ?? '',
      start: toLocalInput(new Date(event.startsAt)),
      end: toLocalInput(new Date(event.endsAt)),
      allDay: event.allDay,
      categoryId: event.category?.id ?? '',
      participantIds: event.participants.map((p) => p.id),
      rrule: event.rrule ?? '',
      reminder: event.reminderMinutes === null ? '' : String(event.reminderMinutes),
    };
  }
  // New events default to the next full hour on the selected day.
  const start = new Date(defaultDay);
  const now = new Date();
  start.setHours(now.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    title: '',
    description: '',
    start: toLocalInput(start),
    end: toLocalInput(end),
    allDay: false,
    categoryId: '',
    participantIds: [] as string[],
    rrule: '',
    reminder: '',
  };
}

export function EventSheet({
  event,
  defaultDay,
  categories,
  members,
  saving,
  error,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [form, setForm] = useState(() => initialState(event, defaultDay));
  // Whether an edit or a delete applies to the whole series or one occurrence.
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const isEditing = Boolean(event);
  const isSeries = Boolean(event?.isRecurring);

  const patch = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setStart = (value: string) => {
    // Keep the duration when the start moves, so one field edit is enough.
    const prevStart = fromLocalInput(form.start).getTime();
    const prevEnd = fromLocalInput(form.end).getTime();
    const duration = Math.max(prevEnd - prevStart, 0);
    const next = fromLocalInput(value);
    setForm((f) => ({ ...f, start: value, end: toLocalInput(new Date(next.getTime() + duration)) }));
  };

  const submit = () => {
    const start = fromLocalInput(form.start);
    const end = form.allDay ? new Date(start.getTime() + 86_399_000) : fromLocalInput(form.end);
    const draft: EventDraft = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      allDay: form.allDay,
      categoryId: form.categoryId || null,
      participantIds: form.participantIds,
      rrule: form.rrule || null,
      reminderMinutes: form.reminder === '' ? null : Number(form.reminder),
    };
    onSave(draft, isSeries ? scope : 'all');
  };

  const toggleParticipant = (id: string) =>
    patch(
      'participantIds',
      form.participantIds.includes(id)
        ? form.participantIds.filter((p) => p !== id)
        : [...form.participantIds, id],
    );

  const valid = form.title.trim().length > 0 && (form.allDay || fromLocalInput(form.end) >= fromLocalInput(form.start));

  return (
    <Sheet title={isEditing ? 'Событие' : 'Новое событие'} onClose={onClose}>
      {error && <p className="error">{error}</p>}

      <div className="field">
        <label className="field__label" htmlFor="ev-title">
          Название
        </label>
        <input
          id="ev-title"
          className="input"
          value={form.title}
          autoFocus={!isEditing}
          placeholder="Например, ужин у бабушки"
          onChange={(e) => patch('title', e.target.value)}
        />
      </div>

      <div className="field">
        <label className="switch">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => patch('allDay', e.target.checked)}
          />
          Весь день
        </label>
      </div>

      <div className="field field__row">
        <div>
          <label className="field__label" htmlFor="ev-start">
            Начало
          </label>
          <input
            id="ev-start"
            className="input"
            type={form.allDay ? 'date' : 'datetime-local'}
            value={form.allDay ? form.start.slice(0, 10) : form.start}
            onChange={(e) => setStart(form.allDay ? `${e.target.value}T00:00` : e.target.value)}
          />
        </div>
        {!form.allDay && (
          <div>
            <label className="field__label" htmlFor="ev-end">
              Конец
            </label>
            <input
              id="ev-end"
              className="input"
              type="datetime-local"
              value={form.end}
              onChange={(e) => patch('end', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="field">
        <span className="field__label">Категория</span>
        <div className="chip-row">
          <button
            type="button"
            className={'chip' + (form.categoryId === '' ? ' chip--active' : '')}
            onClick={() => patch('categoryId', '')}
          >
            Без категории
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'chip' + (form.categoryId === c.id ? ' chip--active' : '')}
              style={
                form.categoryId === c.id ? { background: c.color, borderColor: c.color } : undefined
              }
              onClick={() => patch('categoryId', c.id)}
            >
              <span className="chip__dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="ev-repeat">
          Повтор
        </label>
        <select
          id="ev-repeat"
          className="select"
          value={form.rrule}
          onChange={(e) => patch('rrule', e.target.value)}
        >
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="ev-reminder">
          Напоминание
        </label>
        <select
          id="ev-reminder"
          className="select"
          value={form.reminder}
          onChange={(e) => patch('reminder', e.target.value)}
        >
          {REMINDERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {members.length > 0 && (
        <div className="field">
          <span className="field__label">Участники</span>
          <div className="chip-row">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={'chip' + (form.participantIds.includes(m.id) ? ' chip--active' : '')}
                onClick={() => toggleParticipant(m.id)}
              >
                {m.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="ev-desc">
          Описание
        </label>
        <textarea
          id="ev-desc"
          className="textarea"
          value={form.description}
          onChange={(e) => patch('description', e.target.value)}
        />
      </div>

      {isSeries && (
        <div className="field">
          <span className="field__label">Применить к</span>
          <div className="chip-row">
            <button
              type="button"
              className={'chip' + (scope === 'this' ? ' chip--active' : '')}
              onClick={() => setScope('this')}
            >
              Этому событию
            </button>
            <button
              type="button"
              className={'chip' + (scope === 'all' ? ' chip--active' : '')}
              onClick={() => setScope('all')}
            >
              Всей серии
            </button>
          </div>
        </div>
      )}

      <button type="button" className="btn" disabled={!valid || saving} onClick={submit}>
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>

      {isEditing && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--danger"
            disabled={saving}
            onClick={() => onDelete(isSeries ? scope : 'all')}
          >
            Удалить
          </button>
        </div>
      )}
    </Sheet>
  );
}
