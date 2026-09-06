import type { CalendarEvent, ColorPref } from '../../api/types';
import { eventColor, CATEGORY_LABELS } from '../../lib/colors';
import { formatTime } from '../../lib/dates';
import { Avatar } from '../../ui/Avatar';

interface Props {
  event: CalendarEvent;
  colorPref: ColorPref;
  onOpen(event: CalendarEvent): void;
}

export function EventCard({ event, colorPref, onOpen }: Props) {
  const editor = event.updatedBy ?? event.author;
  const editedLabel = event.updatedBy
    ? `изменил(а) ${editor.firstName}`
    : `добавил(а) ${event.author.firstName}`;

  return (
    <button type="button" className="event" onClick={() => onOpen(event)}>
      <span className="event__bar" style={{ background: eventColor(event, colorPref) }} />
      <span className="event__body">
        <span className="event__title">{event.title}</span>
        <span className="event__meta">
          <span>
            {event.allDay ? 'Весь день' : `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`}
          </span>
          <span>·</span>
          <span>{CATEGORY_LABELS[event.category]}</span>
          {event.isRecurring && <span title="Повторяющееся событие">🔁</span>}
          {event.reminderMinutes !== null && <span title="Напоминание включено">⏰</span>}
          <span>·</span>
          <span>{editedLabel}</span>
        </span>
      </span>
      {event.participants.length > 0 && (
        <span className="event__avatars">
          {event.participants.slice(0, 3).map((p) => (
            <Avatar key={p.id} person={p} />
          ))}
        </span>
      )}
    </button>
  );
}
