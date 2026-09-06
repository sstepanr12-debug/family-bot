import { useState } from 'react';
import type { Category, Member, RemindMode, Task, TaskDraft } from '../../api/types';
import { toDateInput } from '../../lib/dates';
import { Sheet } from '../../ui/Sheet';

const REMINDERS: { value: string; label: string }[] = [
  { value: '', label: 'Без напоминания' },
  { value: 'morning', label: 'Утром в день срока' },
  { value: 'dayBefore', label: 'За день' },
  { value: 'weekBefore', label: 'За неделю' },
];

interface Props {
  task: Task | null;
  defaultDay: Date;
  categories: Category[];
  members: Member[];
  saving: boolean;
  error: string | null;
  onSave(draft: TaskDraft): void;
  onDelete(): void;
  onClose(): void;
}

export function TaskSheet({
  task,
  defaultDay,
  categories,
  members,
  saving,
  error,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  // A deadline is optional: "оплатить квитанцию" has one, "разобрать кладовку" may not.
  const [hasDue, setHasDue] = useState(task ? task.dueDate !== null : true);
  const [due, setDue] = useState(
    toDateInput(task?.dueDate ? new Date(task.dueDate) : defaultDay),
  );
  const [categoryId, setCategoryId] = useState(task?.category?.id ?? '');
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id ?? '');
  const [remind, setRemind] = useState<string>(task?.remindMode ?? '');

  const submit = () =>
    onSave({
      title: title.trim(),
      notes: notes.trim() || null,
      dueDate: hasDue ? due : null,
      categoryId: categoryId || null,
      assigneeId: assigneeId || null,
      remindMode: (remind || null) as RemindMode | null,
    });

  return (
    <Sheet title={task ? 'Дело' : 'Новое дело'} onClose={onClose}>
      {error && <p className="error">{error}</p>}

      <div className="field">
        <label className="field__label" htmlFor="task-title">
          Что нужно сделать
        </label>
        <input
          id="task-title"
          className="input"
          value={title}
          autoFocus={!task}
          placeholder="Например, оплатить квитанцию"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="switch">
          <input
            type="checkbox"
            checked={hasDue}
            onChange={(e) => setHasDue(e.target.checked)}
          />
          Есть срок
        </label>
      </div>

      {hasDue && (
        <div className="field">
          <label className="field__label" htmlFor="task-due">
            Сделать до
          </label>
          <input
            id="task-due"
            className="input"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      )}

      {categories.length > 0 && (
        <div className="field">
          <span className="field__label">Категория</span>
          <div className="chip-row">
            <button
              type="button"
              className={'chip' + (categoryId === '' ? ' chip--active' : '')}
              onClick={() => setCategoryId('')}
            >
              Без категории
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={'chip' + (categoryId === c.id ? ' chip--active' : '')}
                style={categoryId === c.id ? { background: c.color, borderColor: c.color } : undefined}
                onClick={() => setCategoryId(c.id)}
              >
                <span className="chip__dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div className="field">
          <span className="field__label">Кто делает</span>
          <div className="chip-row">
            <button
              type="button"
              className={'chip' + (assigneeId === '' ? ' chip--active' : '')}
              onClick={() => setAssigneeId('')}
            >
              Любой
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className={'chip' + (assigneeId === m.id ? ' chip--active' : '')}
                onClick={() => setAssigneeId(m.id)}
              >
                {m.firstName}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasDue && (
        <div className="field">
          <label className="field__label" htmlFor="task-remind">
            Напоминание
          </label>
          <select
            id="task-remind"
            className="select"
            value={remind}
            onChange={(e) => setRemind(e.target.value)}
          >
            {REMINDERS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="task-notes">
          Заметка
        </label>
        <textarea
          id="task-notes"
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn"
        disabled={title.trim().length === 0 || saving}
        onClick={submit}
      >
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>

      {task && (
        <div className="btn-row">
          <button type="button" className="btn btn--danger" disabled={saving} onClick={onDelete}>
            Удалить
          </button>
        </div>
      )}
    </Sheet>
  );
}
