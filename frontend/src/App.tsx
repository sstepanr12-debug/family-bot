import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api/client';
import { subscribeToFamily } from './api/socket';
import type {
  CalendarEvent,
  Category,
  ColorPref,
  EventDraft,
  Family,
  Me,
  Member,
  Task,
  TaskDraft,
} from './api/types';
import { CalendarView, type ViewMode } from './features/calendar/CalendarView';
import { EventSheet } from './features/event/EventSheet';
import { FamilySheet } from './features/family/FamilySheet';
import { Onboarding } from './features/family/Onboarding';
import { CategorySheet } from './features/settings/CategorySheet';
import { TaskList } from './features/tasks/TaskList';
import { TaskSheet } from './features/tasks/TaskSheet';
import { addDays, formatMonth, formatWeekRange, startOfWeek } from './lib/dates';
import { haptic, isInsideTelegram, webApp } from './telegram/webapp';

const FAMILY_KEY = 'fc.familyId';

type Tab = 'calendar' | 'tasks' | 'family';

/** Outside Telegram a ?dev=N seat lets two browser tabs act as two members. */
function devSeat(): number | undefined {
  const seat = Number(new URLSearchParams(location.search).get('dev'));
  return Number.isInteger(seat) && seat > 0 ? seat : undefined;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [tab, setTab] = useState<Tab>('calendar');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('day');

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventSheet, setEventSheet] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskSheet, setTaskSheet] = useState(false);
  const [familySheet, setFamilySheet] = useState(false);
  const [categorySheet, setCategorySheet] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  // --- session ---------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const initData = webApp()?.initData ?? '';
        const auth = await api.login(initData, isInsideTelegram() ? undefined : devSeat());
        setMe(auth.user);
        setFamilies(auth.families);
        const remembered = localStorage.getItem(FAMILY_KEY);
        setFamily(auth.families.find((f) => f.id === remembered) ?? auth.families[0] ?? null);
      } catch (err) {
        setFatal(err instanceof Error ? err.message : 'Не удалось войти');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (family) localStorage.setItem(FAMILY_KEY, family.id);
  }, [family]);

  // --- data ------------------------------------------------------------

  const reload = useCallback(async () => {
    if (!family) return;
    // The calendar needs tasks due in the visible week plus every overdue one;
    // the to-do tab needs the full list. One extra request keeps both honest.
    const [list, people, cats, rangeTasks, allTasks] = await Promise.all([
      api.fetchEvents(family.id, weekStart, weekEnd),
      api.fetchMembers(family.id),
      api.fetchCategories(family.id),
      api.fetchTasksForRange(family.id, weekStart, weekEnd),
      api.fetchTasks(family.id),
    ]);
    setEvents(list);
    setMembers(people);
    setCategories(cats);
    // Merge both task sets by id: the calendar and the list share one store.
    const byId = new Map<string, Task>();
    for (const task of [...allTasks, ...rangeTasks]) byId.set(task.id, task);
    setTasks([...byId.values()]);
  }, [family, weekStart, weekEnd]);

  useEffect(() => {
    reload().catch((err) => setFatal(err instanceof Error ? err.message : 'Ошибка загрузки'));
  }, [reload]);

  // --- realtime --------------------------------------------------------

  useEffect(() => {
    if (!family) return;
    return subscribeToFamily(family.id, {
      // A change to a recurring series can add or drop occurrences anywhere in
      // the window, so refetch instead of patching in place.
      onCreated: (event) => {
        if (event.isRecurring) void reload();
        else setEvents((prev) => mergeEvent(prev, event, weekStart, weekEnd));
      },
      onUpdated: () => void reload(),
      onDeleted: ({ eventId, occurrenceStart }) =>
        setEvents((prev) =>
          prev.filter(
            (e) => e.id !== eventId || (occurrenceStart && e.occurrenceStart !== occurrenceStart),
          ),
        ),
      onTaskChanged: (task) =>
        setTasks((prev) => {
          const without = prev.filter((t) => t.id !== task.id);
          return [...without, task];
        }),
      onTaskDeleted: (taskId) => setTasks((prev) => prev.filter((t) => t.id !== taskId)),
      onCategoriesChanged: () => void reload(),
    });
  }, [family, reload, weekStart, weekEnd]);

  // --- events ----------------------------------------------------------

  const openNewEvent = (day: Date) => {
    haptic();
    setSelectedDay(day);
    setEditingEvent(null);
    setSheetError(null);
    setEventSheet(true);
  };

  const saveEvent = async (draft: EventDraft, scope: 'this' | 'all') => {
    if (!family) return;
    setSaving(true);
    setSheetError(null);
    try {
      if (editingEvent) {
        await api.updateEvent(editingEvent.id, draft, scope, editingEvent.occurrenceStart);
      } else {
        await api.createEvent(family.id, draft);
      }
      await reload();
      setEventSheet(false);
      haptic('medium');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (scope: 'this' | 'all') => {
    if (!editingEvent) return;
    setSaving(true);
    try {
      await api.deleteEvent(editingEvent.id, scope, editingEvent.occurrenceStart);
      await reload();
      setEventSheet(false);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  };

  // --- tasks -----------------------------------------------------------

  const openNewTask = () => {
    haptic();
    setEditingTask(null);
    setSheetError(null);
    setTaskSheet(true);
  };

  const openTask = (task: Task) => {
    setEditingTask(task);
    setSheetError(null);
    setTaskSheet(true);
  };

  /** Optimistic tick: the checkbox must feel instant, and roll back on failure. */
  const toggleTask = async (task: Task) => {
    haptic();
    const next = { ...task, done: !task.done, overdue: task.done ? task.overdue : false };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));
    try {
      const saved = await api.updateTask(task.id, { done: next.done });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)));
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  };

  const saveTask = async (draft: TaskDraft) => {
    if (!family) return;
    setSaving(true);
    setSheetError(null);
    try {
      if (editingTask) await api.updateTask(editingTask.id, draft);
      else await api.createTask(family.id, draft);
      await reload();
      setTaskSheet(false);
      haptic('medium');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async () => {
    if (!editingTask) return;
    setSaving(true);
    try {
      await api.deleteTask(editingTask.id);
      await reload();
      setTaskSheet(false);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  };

  // --- navigation ------------------------------------------------------

  const goToday = () => {
    const now = new Date();
    setWeekStart(startOfWeek(now));
    setSelectedDay(now);
  };

  const shiftWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelectedDay(next);
  };

  // --- render ----------------------------------------------------------

  if (loading) return <div className="spinner" />;
  if (fatal) {
    return (
      <div className="center">
        <div className="center__emoji">😕</div>
        <h1>Не получилось</h1>
        <p>{fatal}</p>
        <button type="button" className="btn" onClick={() => location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!family) {
    return (
      <Onboarding
        onReady={(created) => {
          setFamilies((prev) => [...prev, created]);
          setFamily(created);
        }}
      />
    );
  }

  const colorPref = (me?.colorPref ?? 'category') as ColorPref;
  const openTaskCount = tasks.filter((t) => !t.done).length;

  return (
    <div className="app">
      {tab === 'calendar' && (
        <>
          <header className="header">
            <div className="header__row">
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftWeek(-1)}
                aria-label="Предыдущая неделя"
              >
                ‹
              </button>
              <div className="header__title">
                <span className="header__month">{formatMonth(selectedDay)}</span>
                <div className="header__sub">{formatWeekRange(weekStart)}</div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => shiftWeek(1)}
                aria-label="Следующая неделя"
              >
                ›
              </button>
              <button type="button" className="icon-btn" onClick={goToday} aria-label="Сегодня">
                ⌖
              </button>
            </div>

            <div className="chip-row">
              <button
                type="button"
                className={'chip' + (mode === 'day' ? ' chip--active' : '')}
                onClick={() => setMode('day')}
              >
                День
              </button>
              <button
                type="button"
                className={'chip' + (mode === 'week' ? ' chip--active' : '')}
                onClick={() => setMode('week')}
              >
                Неделя
              </button>
            </div>
          </header>

          <CalendarView
            mode={mode}
            weekStart={weekStart}
            selectedDay={selectedDay}
            events={events}
            tasks={tasks}
            colorPref={colorPref}
            onSelectDay={setSelectedDay}
            onOpenEvent={(event) => {
              setEditingEvent(event);
              setSheetError(null);
              setEventSheet(true);
            }}
            onOpenTask={openTask}
            onToggleTask={toggleTask}
            onAddForDay={openNewEvent}
          />
        </>
      )}

      {tab === 'tasks' && (
        <>
          <header className="header">
            <div className="header__row">
              <div className="header__title">
                Дела
                <div className="header__sub">
                  {openTaskCount === 0 ? 'всё сделано' : `${openTaskCount} в работе`}
                </div>
              </div>
            </div>
          </header>
          <TaskList tasks={tasks} onToggle={toggleTask} onOpen={openTask} onAdd={openNewTask} />
        </>
      )}

      {tab === 'family' && (
        <>
          <header className="header">
            <div className="header__row">
              <div className="header__title">
                {family.name}
                <div className="header__sub">{members.length} участников</div>
              </div>
            </div>
          </header>
          <div className="content">
            <button type="button" className="btn btn--ghost" onClick={() => setCategorySheet(true)}>
              Категории и цвета
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setFamilySheet(true)}>
              Участники и приглашение
            </button>
          </div>
        </>
      )}

      {tab !== 'family' && (
        <button
          type="button"
          className="fab"
          onClick={() => (tab === 'calendar' ? openNewEvent(selectedDay) : openNewTask())}
          aria-label={tab === 'calendar' ? 'Добавить событие' : 'Добавить дело'}
        >
          +
        </button>
      )}

      <nav className="tabbar">
        <button
          type="button"
          className={'tabbar__item' + (tab === 'calendar' ? ' tabbar__item--active' : '')}
          onClick={() => setTab('calendar')}
        >
          <span className="tabbar__icon">📅</span>
          Календарь
        </button>
        <button
          type="button"
          className={'tabbar__item' + (tab === 'tasks' ? ' tabbar__item--active' : '')}
          onClick={() => setTab('tasks')}
        >
          <span className="tabbar__icon">
            ✓{openTaskCount > 0 && <span className="tabbar__badge">{openTaskCount}</span>}
          </span>
          Дела
        </button>
        <button
          type="button"
          className={'tabbar__item' + (tab === 'family' ? ' tabbar__item--active' : '')}
          onClick={() => setTab('family')}
        >
          <span className="tabbar__icon">👪</span>
          Семья
        </button>
      </nav>

      {eventSheet && (
        <EventSheet
          event={editingEvent}
          defaultDay={selectedDay}
          categories={categories}
          members={members}
          saving={saving}
          error={sheetError}
          onSave={saveEvent}
          onDelete={removeEvent}
          onClose={() => setEventSheet(false)}
        />
      )}

      {taskSheet && (
        <TaskSheet
          task={editingTask}
          defaultDay={selectedDay}
          categories={categories}
          members={members}
          saving={saving}
          error={sheetError}
          onSave={saveTask}
          onDelete={removeTask}
          onClose={() => setTaskSheet(false)}
        />
      )}

      {categorySheet && (
        <CategorySheet
          familyId={family.id}
          categories={categories}
          onChanged={setCategories}
          onClose={() => setCategorySheet(false)}
        />
      )}

      {familySheet && (
        <FamilySheet
          family={family}
          families={families}
          members={members}
          colorPref={colorPref}
          onColorPref={(pref) => setMe((prev) => (prev ? { ...prev, colorPref: pref } : prev))}
          onSelectFamily={(next) => {
            setFamily(next);
            setFamilySheet(false);
          }}
          onFamilyChanged={(next) => {
            setFamily(next);
            setFamilies((prev) => prev.map((f) => (f.id === next.id ? next : f)));
          }}
          onJoined={(next) => {
            setFamilies((prev) => (prev.some((f) => f.id === next.id) ? prev : [...prev, next]));
            setFamily(next);
            setFamilySheet(false);
          }}
          onClose={() => setFamilySheet(false)}
        />
      )}
    </div>
  );
}

function mergeEvent(prev: CalendarEvent[], event: CalendarEvent, from: Date, to: Date) {
  const start = new Date(event.startsAt);
  if (start < from || start >= to) return prev;
  const without = prev.filter(
    (e) => !(e.id === event.id && e.occurrenceStart === event.occurrenceStart),
  );
  return [...without, event].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
