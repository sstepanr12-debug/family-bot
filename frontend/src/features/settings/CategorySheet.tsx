import { useState } from 'react';
import * as api from '../../api/client';
import type { Category } from '../../api/types';
import { CATEGORY_PALETTE } from '../../lib/colors';
import { Sheet } from '../../ui/Sheet';

interface Props {
  familyId: string;
  categories: Category[];
  onChanged(categories: Category[]): void;
  onClose(): void;
}

function ColorPicker({ value, onPick }: { value: string; onPick(color: string): void }) {
  return (
    <div className="palette">
      {CATEGORY_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={'palette__dot' + (color === value ? ' palette__dot--on' : '')}
          style={{ background: color }}
          aria-label={`Цвет ${color}`}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

export function CategorySheet({ familyId, categories, onChanged, onClose }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => onChanged(await api.fetchCategories(familyId));

  const startEdit = (category: Category) => {
    setEditing(category.id);
    setDraftName(category.name);
  };

  const saveName = (category: Category) =>
    run(async () => {
      const name = draftName.trim();
      if (name && name !== category.name) await api.updateCategory(category.id, { name });
      setEditing(null);
      await refresh();
    });

  return (
    <Sheet title="Категории" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      <p className="header__sub" style={{ marginTop: 0 }}>
        Цвет категории — это цвет события и дела в календаре.
      </p>

      <div className="card">
        {categories.map((category) => (
          <div key={category.id} className="member">
            <span className="swatch" style={{ background: category.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {editing === category.id ? (
                <input
                  className="input"
                  value={draftName}
                  autoFocus
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => saveName(category)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName(category);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="linklike"
                  onClick={() => startEdit(category)}
                >
                  {category.name}
                </button>
              )}
              {editing === category.id && (
                <ColorPicker
                  value={category.color}
                  onPick={(color) =>
                    run(async () => {
                      await api.updateCategory(category.id, { color });
                      await refresh();
                    })
                  }
                />
              )}
            </div>
            <button
              type="button"
              className="icon-btn"
              disabled={busy}
              aria-label={`Убрать ${category.name}`}
              title="Убрать из списка (события сохранятся)"
              onClick={() =>
                run(async () => {
                  await api.updateCategory(category.id, { archived: true });
                  await refresh();
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field__label" htmlFor="cat-name">
            Название
          </label>
          <input
            id="cat-name"
            className="input"
            value={newName}
            autoFocus
            placeholder="Например, Планы Миши"
            onChange={(e) => setNewName(e.target.value)}
          />
          <ColorPicker value={newColor} onPick={setNewColor} />
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={busy || newName.trim().length === 0}
              onClick={() =>
                run(async () => {
                  await api.createCategory(familyId, newName.trim(), newColor);
                  setNewName('');
                  setAdding(false);
                  await refresh();
                })
              }
            >
              Добавить
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--ghost"
          style={{ marginTop: 12 }}
          onClick={() => setAdding(true)}
        >
          Добавить категорию
        </button>
      )}
    </Sheet>
  );
}
