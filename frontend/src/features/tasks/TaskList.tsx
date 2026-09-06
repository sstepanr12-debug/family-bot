import { useMemo, useState } from 'react';
import type { Task } from '../../api/types';
import { taskColor } from '../../lib/colors';
import { addDays, formatDay, startOfDay } from '../../lib/dates';

interface Props {
  tasks: Task[];
  onToggle(task: Task): void;
  onOpen(task: Task): void;
  onAdd(): void;
}

type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'someday';

const GROUP_TITLES: Record<GroupKey, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  week: 'На этой неделе',
  later: 'Позже',
  someday: 'Без срока',
};

/** Buckets a task by how urgent its deadline is relative to today. */
function groupOf(task: Task, today: Date, weekEnd: Date): GroupKey {
  if (!task.dueDate) return 'someday';
  const due = startOfDay(new Date(task.dueDate));
  if (due < today) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  return due < weekEnd ? 'week' : 'later';
}

function dueLabel(task: Task, today: Date): string | null {
  if (!task.dueDate) return null;
  const due = startOfDay(new Date(task.dueDate));
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера';
  return formatDay(due);
}

export function TaskRow({
  task,
  today,
  onToggle,
  onOpen,
}: {
  task: Task;
  today: Date;
  onToggle(task: Task): void;
  onOpen(task: Task): void;
}) {
  const label = dueLabel(task, today);
  return (
    <div className={'task' + (task.done ? ' task--done' : '')}>
      <button
        type="button"
        className={'task__check' + (task.done ? ' task__check--on' : '')}
        onClick={() => onToggle(task)}
        aria-label={task.done ? 'Вернуть в работу' : 'Выполнено'}
        aria-pressed={task.done}
      >
        {task.done ? '✓' : ''}
      </button>
      <button type="button" className="task__body" onClick={() => onOpen(task)}>
        <span className="task__title">{task.title}</span>
        <span className="task__meta">
          {task.category && (
            <>
              <span className="task__dot" style={{ background: taskColor(task) }} />
              <span>{task.category.name}</span>
            </>
          )}
          {label && (
            <span className={task.overdue ? 'task__due task__due--overdue' : 'task__due'}>
              {task.overdue ? `просрочено · ${label}` : label}
            </span>
          )}
          {task.assignee && <span>· {task.assignee.firstName}</span>}
          {task.remindMode && <span title="Напоминание включено">⏰</span>}
        </span>
      </button>
    </div>
  );
}

export function TaskList({ tasks, onToggle, onOpen, onAdd }: Props) {
  const [showDone, setShowDone] = useState(false);
  const today = useMemo(() => startOfDay(new Date()), []);
  const weekEnd = useMemo(() => addDays(today, 7), [today]);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const groups = useMemo(() => {
    const acc: Record<GroupKey, Task[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      someday: [],
    };
    for (const task of open) acc[groupOf(task, today, weekEnd)].push(task);
    return acc;
  }, [open, today, weekEnd]);

  const order: GroupKey[] = ['overdue', 'today', 'week', 'later', 'someday'];
  const anyOpen = open.length > 0;

  return (
    <div className="content">
      {!anyOpen && (
        <div className="empty">
          <span className="empty__emoji">🧺</span>
          Дел нет — всё сделано
          <button type="button" className="empty__action" onClick={onAdd}>
            Добавить дело
          </button>
        </div>
      )}

      {order.map((key) =>
        groups[key].length === 0 ? null : (
          <section key={key}>
            <h3 className={'daygroup__title' + (key === 'overdue' ? ' daygroup__title--overdue' : '')}>
              {GROUP_TITLES[key]} · {groups[key].length}
            </h3>
            <div className="daygroup__list">
              {groups[key].map((task) => (
                <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ),
      )}

      {done.length > 0 && (
        <section>
          <button
            type="button"
            className="daygroup__toggle"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
          >
            {showDone ? '▾' : '▸'} Выполненные · {done.length}
          </button>
          {showDone && (
            <div className="daygroup__list">
              {done.map((task) => (
                <TaskRow key={task.id} task={task} today={today} onToggle={onToggle} onOpen={onOpen} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
