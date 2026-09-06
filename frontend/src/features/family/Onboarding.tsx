import { useState } from 'react';
import * as api from '../../api/client';
import type { ColorPref, Family } from '../../api/types';

interface Props {
  onReady(family: Family): void;
}

/** First run: create a household or join one, and pick how events are coloured. */
export function Onboarding({ onReady }: Props) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [colorPref, setColorPref] = useState<ColorPref>('category');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setColorPref(colorPref);
      const family =
        tab === 'create' ? await api.createFamily(name.trim()) : await api.joinFamily(code.trim());
      onReady(family);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  };

  const valid = tab === 'create' ? name.trim().length > 0 : code.trim().length >= 4;

  return (
    <div className="center">
      <div className="center__emoji">🏡</div>
      <h1>Семейный календарь</h1>
      <p>Общее расписание для всех, кто дома.</p>

      <div className="chip-row" style={{ justifyContent: 'center' }}>
        <button
          type="button"
          className={'chip' + (tab === 'create' ? ' chip--active' : '')}
          onClick={() => setTab('create')}
        >
          Создать семью
        </button>
        <button
          type="button"
          className={'chip' + (tab === 'join' ? ' chip--active' : '')}
          onClick={() => setTab('join')}
        >
          У меня есть код
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === 'create' ? (
        <div className="field">
          <label className="field__label" htmlFor="fam-name">
            Название семьи
          </label>
          <input
            id="fam-name"
            className="input"
            value={name}
            placeholder="Например, Ивановы"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      ) : (
        <div className="field">
          <label className="field__label" htmlFor="fam-code">
            Код приглашения
          </label>
          <input
            id="fam-code"
            className="input"
            value={code}
            placeholder="8 символов"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
      )}

      <div className="field">
        <span className="field__label">Цвет событий по</span>
        <div className="chip-row">
          <button
            type="button"
            className={'chip' + (colorPref === 'category' ? ' chip--active' : '')}
            onClick={() => setColorPref('category')}
          >
            Категории
          </button>
          <button
            type="button"
            className={'chip' + (colorPref === 'author' ? ' chip--active' : '')}
            onClick={() => setColorPref('author')}
          >
            Автору
          </button>
        </div>
      </div>

      <button type="button" className="btn" disabled={!valid || busy} onClick={submit}>
        {busy ? 'Секунду…' : tab === 'create' ? 'Создать' : 'Присоединиться'}
      </button>
    </div>
  );
}
