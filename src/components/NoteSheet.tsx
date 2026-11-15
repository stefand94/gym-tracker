import { useEffect, useState } from 'react';
import { getExercise } from '../data/library';
import {
  applySuggestion,
  dismissSuggestion,
  NOTE_SCHEMA,
  notePrompt,
  setItemNote,
  swapInRoutine,
  toSuggestions,
  unreadNote,
  type RawSuggestion,
} from '../lib/notes';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Exercise, Workout, WorkoutItem } from '../types';
import { IconCheck, IconClose, IconNote, IconSpark } from './Icons';
import { Sheet } from './Sheet';

/** Type or dictate a note. Saved the moment you tap Save, online or not. */
export function NoteSheet({
  title,
  initial,
  placeholder,
  onSave,
  onClose,
}: {
  title: string;
  initial?: string;
  placeholder: string;
  onSave: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial ?? '');
  const save = (t: string) => {
    onSave(t);
    onClose();
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <textarea
        className="input note-input"
        rows={4}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="small dim note-hint">Tap the mic on your keyboard to dictate.</div>
      <div className="row">
        {initial ? (
          <button className="btn btn-ghost btn-danger grow" onClick={() => save('')}>
            Delete note
          </button>
        ) : (
          <button className="btn grow" onClick={onClose}>
            Cancel
          </button>
        )}
        <button className="btn btn-primary grow" disabled={text.trim() === (initial ?? '').trim()} onClick={() => save(text)}>
          Save note
        </button>
      </div>
    </Sheet>
  );
}

const useOnline = () => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
};

/**
 * An exercise's note on its card, and the changes Claude read out of it as chips: ✓ applies one, ✕ drops it.
 * A new or edited note is read as soon as Claude is set up and you're online; the note itself always stays.
 */
export function ItemNote({ ex, item, update }: { ex: Exercise; item: WorkoutItem; update: (fn: (w: Workout) => Workout) => void }) {
  const { state, dispatch } = useStore();
  const { ask, ready } = useClaude();
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<{ note: string; msg: string } | null>(null);
  const routine = state.routines.find((r) => r.id === state.active?.routineId && !r.archived);
  const canSwap = !!routine && routine.blocks.some((b) => !b.rehabDose && b.items.some((i) => i.exerciseId === ex.id));
  const unread = unreadNote(item);
  const failed = error?.note === item.note;

  const read = async () => {
    const note = item.note!;
    setReading(true);
    setError(null);
    try {
      const { data } = await ask<{ suggestions: RawSuggestion[] }>({ prompt: notePrompt(item, ex, canSwap), schema: NOTE_SCHEMA });
      const suggestions = toSuggestions(data.suggestions, item, ex, getExercise, canSwap);
      // only if the note hasn't been edited meanwhile
      update((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({
          ...b,
          items: b.items.map((i) => (i.id === item.id && i.note === note ? { ...i, noteSuggestions: suggestions } : i)),
        })),
      }));
    } catch (e) {
      setError({ note, msg: aiMessage(e) });
    } finally {
      setReading(false);
    }
  };

  useEffect(() => {
    if (unread && ready && online && !reading && !failed) void read();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.note, unread, ready, online]);

  const accept = (k: number) => {
    const s = item.noteSuggestions![k];
    if (s.kind === 'swap') {
      const next = routine && swapInRoutine(routine, ex.id, s.exerciseId, getExercise);
      if (next) dispatch({ type: 'routineSave', routine: next, now: new Date().toISOString() });
      update((w) => dismissSuggestion(w, item.id, k));
    } else update((w) => applySuggestion(w, item.id, k, state.history, getExercise));
  };

  if (!item.note && !editing) return null;
  return (
    <>
      {item.note && (
        <div className="note-box">
          <button type="button" className="note-text" onClick={() => setEditing(true)} aria-label="Edit note">
            <IconNote />
            <span>{item.note}</span>
          </button>
          {reading && (
            <div className="note-status small dim">
              <IconSpark /> Reading your note…
            </div>
          )}
          {!reading && failed && (
            <div className="note-status small">
              <span className="error-text">{error!.msg}</span>
              {ready && online && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={read}>
                  Try again
                </button>
              )}
            </div>
          )}
          {!reading && unread && !failed && (!ready || !online) && (
            <div className="note-status small dim">{ready ? 'Claude will read this when you’re back online.' : 'Saved.'}</div>
          )}
          {!!item.noteSuggestions?.length && (
            <div className="note-chips">
              {item.noteSuggestions.map((s, k) => (
                <span key={k} className="note-chip">
                  <button type="button" className="note-chip-yes" onClick={() => accept(k)}>
                    <IconCheck /> {s.label}
                  </button>
                  <button
                    type="button"
                    className="note-chip-no"
                    aria-label={`Dismiss ${s.label}`}
                    onClick={() => update((w) => dismissSuggestion(w, item.id, k))}
                  >
                    <IconClose />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {editing && (
        <NoteSheet
          title={`Note · ${ex.name}`}
          initial={item.note}
          placeholder="e.g. left shoulder twinged on set 3, used Upstairs 2"
          onSave={(t) => update((w) => setItemNote(w, item.id, t))}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}

/** The session note, or a quiet button to add one. */
export function WorkoutNoteCard({ note, onEdit }: { note?: string; onEdit: () => void }) {
  return note ? (
    <button type="button" className="card note-card" onClick={onEdit} aria-label="Edit session note">
      <IconNote />
      <span>{note}</span>
    </button>
  ) : (
    <button type="button" className="btn btn-ghost btn-sm note-add" onClick={onEdit}>
      <IconNote /> Add a session note
    </button>
  );
}
