import type { CalendarEvent, ColorPref, Task } from '../../api/types';
import { eventColor, taskColor } from '../../lib/colors';
import { formatDay, isSameDay, isToday, startOfDay, WEEKDAYS, weekDays } from '../../lib/dates';
import { EventCard } from './EventCard';

export type ViewMode = 'week' | 'day';

interface Props {
  mode: ViewMode;
  weekStart: Date;
  selectedDay: Date;
  events: CalendarEvent[];
  tasks: Task[];
  colorPref: ColorPref;
  onSelectDay(day: Date): void;
  onOpenEvent(event: CalendarEvent): void;
  onOpenTask(task: Task): void;
  onToggleTask(task: Task): void;
  onAddForDay(day: Date): void;
}

const eventsOfDay = (events: CalendarEvent[], day: Date) =>
  events.filter((e) => isSameDay(new Date(e.startsAt), day));

/**
 * Tasks to show under a day: those due that day, plus — on today only — every
 * overdue one, so a missed deadline stays in sight instead of sinking into the
 * past where nobody scrolls.
 */
function tasksOfDay(tasks: Task[], day: Date): Task[] {
  const showOverdueHere = isToday(day);
  return tasks.filter((task) => {
    if (task.done || !task.dueDate) return false;
    if (task.overdue) return showOverdueHere;
    return isSameDay(startOfDay(new Date(task.dueDate)), startOfDay(day));
  });
}

function WeekStrip({
  weekStart,
  selectedDay,
  events,
  tasks,
  colorPref,
  onSelectDay,
}: Pick<Props, 'weekStart' | 'selectedDay' | 'events' | 'tasks' | 'colorPref' | 'onSelectDay'>) {
  return (
    <div className="weekstrip">
      {weekDays(weekStart).map((day, i) => {
        const marks = [
          ...eventsOfDay(events, day).map((e) => eventColor(e, colorPref)),
          ...tasksOfDay(tasks, day).map(taskColor),
        ];
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
              {marks.slice(0, 3).map((color, index) => (
                <span
                  key={index}
                  className="weekstrip__dot"
                  style={{ background: selected ? 'currentColor' : color }}
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayTask({
  task,
  onOpenTask,
  onToggleTask,
}: {
  task: Task;
  onOpenTask(task: Task): void;
  onToggleTask(task: Task): void;
}) {
  return (
    <div className={'daytask' + (task.overdue ? ' daytask--overdue' : '')}>
      <button
        type="button"
        className="task__check"
        onClick={() => onToggleTask(task)}
        aria-label="Выполнено"
      />
      <button type="button" className="daytask__body" onClick={() => onOpenTask(task)}>
        <span className="task__dot" style={{ background: taskColor(task) }} />
        <span className="daytask__title">{task.title}</span>
        {task.overdue && <span className="daytask__badge">просрочено</span>}
      </button>
    </div>
  );
}

function DayGroup({
  day,
  events,
  tasks,
  colorPref,
  onOpenEvent,
  onOpenTask,
  onToggleTask,
  onAddForDay,
}: {
  day: Date;
  events: CalendarEvent[];
  tasks: Task[];
  colorPref: ColorPref;
  onOpenEvent(event: CalendarEvent): void;
  onOpenTask(task: Task): void;
  onToggleTask(task: Task): void;
  onAddForDay(day: Date): void;
}) {
  const empty = events.length === 0 && tasks.length === 0;

  return (
    <section>
      <h3 className={'daygroup__title' + (isToday(day) ? ' daygroup__title--today' : '')}>
        {WEEKDAYS[(day.getDay() + 6) % 7]}, {formatDay(day)}
      </h3>

      {empty ? (
        <div className="empty">
          <span className="empty__emoji">🌤️</span>
          Свободный день
          <button type="button" className="empty__action" onClick={() => onAddForDay(day)}>
            Добавить событие
          </button>
        </div>
      ) : (
        <div className="daygroup__list">
          {tasks.map((task) => (
            <DayTask key={task.id} task={task} onOpenTask={onOpenTask} onToggleTask={onToggleTask} />
          ))}
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
  const { mode, weekStart, selectedDay, events, tasks, colorPref } = props;
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
            tasks={tasksOfDay(tasks, day)}
            colorPref={colorPref}
            onOpenEvent={props.onOpenEvent}
            onOpenTask={props.onOpenTask}
            onToggleTask={props.onToggleTask}
            onAddForDay={props.onAddForDay}
          />
        ))}
      </div>
    </>
  );
}
