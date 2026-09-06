import { useState } from 'react';
import * as api from '../../api/client';
import type { ColorPref, Family, Member } from '../../api/types';
import { Avatar } from '../../ui/Avatar';
import { Sheet } from '../../ui/Sheet';

interface Props {
  family: Family;
  families: Family[];
  members: Member[];
  colorPref: ColorPref;
  onColorPref(pref: ColorPref): void;
  onSelectFamily(family: Family): void;
  onFamilyChanged(family: Family): void;
  onJoined(family: Family): void;
  onClose(): void;
}

export function FamilySheet({
  family,
  families,
  members,
  colorPref,
  onColorPref,
  onSelectFamily,
  onFamilyChanged,
  onJoined,
  onClose,
}: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable in some webviews; the code stays visible anyway.
      setError('Не удалось скопировать — перепишите код вручную');
    }
  };

  return (
    <Sheet title={family.name} onClose={onClose}>
      {error && <p className="error">{error}</p>}

      <div className="field">
        <span className="field__label">Код приглашения</span>
        <div className="invite-code">{family.inviteCode}</div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={copyCode}>
            {copied ? 'Скопировано' : 'Скопировать'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => run(async () => onFamilyChanged(await api.regenerateInvite(family.id)))}
          >
            Новый код
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Участники</span>
        <div className="card">
          {members.map((m) => (
            <div key={m.id} className="member">
              <Avatar person={m} size={32} />
              <div style={{ flex: 1 }}>
                <div>
                  {m.firstName} {m.lastName ?? ''}
                </div>
                {m.username && <div className="header__sub">@{m.username}</div>}
              </div>
              {m.role === 'owner' && <span className="header__sub">владелец</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Цвет событий по</span>
        <div className="chip-row">
          <button
            type="button"
            className={'chip' + (colorPref === 'category' ? ' chip--active' : '')}
            onClick={() => run(async () => { await api.setColorPref('category'); onColorPref('category'); })}
          >
            Категории
          </button>
          <button
            type="button"
            className={'chip' + (colorPref === 'author' ? ' chip--active' : '')}
            onClick={() => run(async () => { await api.setColorPref('author'); onColorPref('author'); })}
          >
            Автору
          </button>
        </div>
      </div>

      {families.length > 1 && (
        <div className="field">
          <span className="field__label">Мои семьи</span>
          <div className="chip-row">
            {families.map((f) => (
              <button
                key={f.id}
                type="button"
                className={'chip' + (f.id === family.id ? ' chip--active' : '')}
                onClick={() => onSelectFamily(f)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="join-code">
          Присоединиться к другой семье
        </label>
        <div className="field__row">
          <input
            id="join-code"
            className="input"
            value={code}
            placeholder="Код"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy || code.trim().length < 4}
            onClick={() =>
              run(async () => {
                onJoined(await api.joinFamily(code.trim()));
                setCode('');
              })
            }
          >
            Войти
          </button>
        </div>
      </div>
    </Sheet>
  );
}
