import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api/client';
import { subscribeToFamily } from './api/socket';
import type { CalendarEvent, ColorPref, EventDraft, Family, Me, Member } from './api/types';
import { CalendarView, type ViewMode } from './features/calendar/CalendarView';
import { EventSheet } from './features/event/EventSheet';
import { FamilySheet } from './features/family/FamilySheet';
import { Onboarding } from './features/family/Onboarding';
import { addDays, formatMonth, formatWeekRange, startOfWeek } from './lib/dates';
import { haptic, isInsideTelegram, webApp } from './telegram/webapp';

const FAMILY_KEY = 'fc.familyId';

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
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('day');

  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [familySheet, setFamilySheet] = useState(false);
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
    const [list, people] = await Promise.all([
      api.fetchEvents(family.id, weekStart, weekEnd),
      api.fetchMembers(family.id),
    ]);
    setEvents(list);
    setMembers(people);
  }, [family, weekStart, weekEnd]);

  useEffect(() => {
    reload().catch((err) => setFatal(err instanceof Error ? err.message : 'Ошибка загрузки'));
  }, [reload]);

  // --- realtime --------------------------------------------------------

  useEffect(() => {
    if (!family) return;
    // A change to a recurring series can add or drop occurrences anywhere in the
    // window, so refetch instead of patching in place; one-off events patch.
    return subscribeToFamily(family.id, {
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
    });
  }, [family, reload, weekStart, weekEnd]);

  // --- actions ---------------------------------------------------------

  const openNew = (day: Date) => {
    haptic();
    setSelectedDay(day);
    setEditing(null);
    setSheetError(null);
    setSheetOpen(true);
  };

  const openExisting = (event: CalendarEvent) => {
    setEditing(event);
    setSheetError(null);
    setSheetOpen(true);
  };

  const save = async (draft: EventDraft, scope: 'this' | 'all') => {
    if (!family) return;
    setSaving(true);
    setSheetError(null);
    try {
      if (editing) {
        await api.updateEvent(editing.id, draft, scope, editing.occurrenceStart);
      } else {
        await api.createEvent(family.id, draft);
      }
      await reload();
      setSheetOpen(false);
      haptic('medium');
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (scope: 'this' | 'all') => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.deleteEvent(editing.id, scope, editing.occurrenceStart);
      await reload();
      setSheetOpen(false);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="app">
      <header className="header">
        <div className="header__row">
          <button type="button" className="icon-btn" onClick={() => shiftWeek(-1)} aria-label="Предыдущая неделя">
            ‹
          </button>
          <div className="header__title">
            {formatMonth(selectedDay)}
            <div className="header__sub">{formatWeekRange(weekStart)}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => shiftWeek(1)} aria-label="Следующая неделя">
            ›
          </button>
          <button type="button" className="icon-btn" onClick={goToday} aria-label="Сегодня">
            ⌖
          </button>
          <button type="button" className="icon-btn" onClick={() => setFamilySheet(true)} aria-label="Семья">
            👪
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
        colorPref={(me?.colorPref ?? 'category') as ColorPref}
        onSelectDay={setSelectedDay}
        onOpenEvent={openExisting}
        onAddForDay={openNew}
      />

      <button type="button" className="fab" onClick={() => openNew(selectedDay)} aria-label="Добавить событие">
        +
      </button>

      {sheetOpen && (
        <EventSheet
          event={editing}
          defaultDay={selectedDay}
          members={members}
          saving={saving}
          error={sheetError}
          onSave={save}
          onDelete={remove}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {familySheet && (
        <FamilySheet
          family={family}
          families={families}
          members={members}
          colorPref={(me?.colorPref ?? 'category') as ColorPref}
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
