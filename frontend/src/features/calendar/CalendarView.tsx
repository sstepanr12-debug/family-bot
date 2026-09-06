import type { CalendarEvent, ColorPref } from '../../api/types';
import { eventColor } from '../../lib/colors';
import { formatDay, isSameDay, isToday, WEEKDAYS, weekDays } from '../../lib/dates';
import { EventCard } from './EventCard';

export type ViewMode = 'week' | 'day';

interface Props {
  mode: ViewMode;
  weekStart: Date;
  selectedDay: Date;
  events: CalendarEvent[];
  colorPref: ColorPref;
  onSelectDay(day: Date): void;
  onOpenEvent(event: CalendarEvent): void;
  onAddForDay(day: Date): void;
}

const eventsOfDay = (events: CalendarEvent[], day: Date) =>
  events.filter((e) => isSameDay(new Date(e.startsAt), day));

/** Weekday selector; the dots preview how busy each day is. */
function WeekStrip({
  weekStart,
  selectedDay,
  events,
  colorPref,
  onSelectDay,
}: Pick<Props, 'weekStart' | 'selectedDay' | 'events' | 'colorPref' | 'onSelectDay'>) {
  return (
    <div className="weekstrip">
      {weekDays(weekStart).map((day, i) => {
        const dayEvents = eventsOfDay(events, day);
        const selected = isSameDay(day, selectedDay);
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={
              'weekstrip__day' +
              (selected ? ' weekstrip__day--selected' : '') +
              (isToday(day) ? ' weekstrip__day--today' : '')
            }
            onClick={() => onSelectDay(day)}
            aria-pressed={selected}
          >
            <span className="weekstrip__name">{WEEKDAYS[i]}</span>
            <span className="weekstrip__num">{day.getDate()}</span>
            <span className="weekstrip__dots">
              {dayEvents.slice(0, 3).map((e) => (
                <span
                  key={e.id + e.occurrenceStart}
                  className="weekstrip__dot"
                  style={{
                    background: selected ? 'currentColor' : eventColor(e, colorPref),
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayGroup({
  day,
  events,
  colorPref,
  onOpenEvent,
  onAddForDay,
}: {
  day: Date;
  events: CalendarEvent[];
  colorPref: ColorPref;
  onOpenEvent(event: CalendarEvent): void;
  onAddForDay(day: Date): void;
}) {
  return (
    <section>
      <h3 className={'daygroup__title' + (isToday(day) ? ' daygroup__title--today' : '')}>
        {WEEKDAYS[(day.getDay() + 6) % 7]}, {formatDay(day)}
      </h3>
      {events.length === 0 ? (
        <div className="empty">
          <span className="empty__emoji">🌤️</span>
          Свободный день
          <button type="button" className="empty__action" onClick={() => onAddForDay(day)}>
            Добавить событие
          </button>
        </div>
      ) : (
        <div className="daygroup__list">
          {events.map((event) => (
            <EventCard
              key={event.id + event.occurrenceStart}
              event={event}
              colorPref={colorPref}
              onOpen={onOpenEvent}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function CalendarView(props: Props) {
  const { mode, weekStart, selectedDay, events, colorPref, onOpenEvent, onAddForDay } = props;
  const days = mode === 'week' ? weekDays(weekStart) : [selectedDay];

  return (
    <>
      <WeekStrip {...props} />
      <div className="content">
        {days.map((day) => (
          <DayGroup
            key={day.toISOString()}
            day={day}
            events={eventsOfDay(events, day)}
            colorPref={colorPref}
            onOpenEvent={onOpenEvent}
            onAddForDay={onAddForDay}
          />
        ))}
      </div>
    </>
  );
}
