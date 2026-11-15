import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { getExercise } from '../data/library';
import {
  addItemNote,
  addReply,
  applySuggestion,
  dismissSuggestion,
  NOTE_SCHEMA,
  notePrompt,
  removeItemNote,
  swapInRoutine,
  threadOf,
  toSuggestions,
  unreadNote,
  type RawSuggestion,
} from '../lib/notes';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Exercise, NoteMessage, NoteSuggestion, Workout, WorkoutItem } from '../types';
import { IconCheck, IconClose, IconNote, IconSend, IconSpark } from './Icons';
import { Sheet } from './Sheet';

/**
 * A note as a chat: your messages on the right, Claude's replies on the left, and a box at the bottom that clears
 * after each send so you can keep going. Saved the moment you send, online or not. Tap one of yours to edit or delete it.
 */
export function NoteChat({
  title,
  thread,
  placeholder,
  onSend,
  onRemove,
  onClose,
  children,
}: {
  title: string;
  thread: NoteMessage[];
  placeholder: string;
  onSend: (text: string) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
  /** Under the messages: Claude's status and chips. */
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const shown = thread.map((m, k) => ({ m, k })).filter(({ m }) => m.text);

  useEffect(() => {
    end.current?.closest('.sheet')?.scrollTo({ top: 1e6 });
  }, [thread.length, children]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
    setPicked(null);
    input.current?.focus();
  };

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="chat">
        {shown.length === 0 && <div className="small dim chat-empty">Type, or tap the mic on your keyboard to dictate.</div>}
        {shown.map(({ m, k }) =>
          m.from === 'me' ? (
            <div key={k} className="chat-row chat-me">
              <button type="button" className="bubble bubble-me" onClick={() => setPicked(picked === k ? null : k)}>
                {m.text}
              </button>
              {picked === k && (
                <div className="bubble-actions">
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => {
                      onRemove(k);
                      setText(m.text);
                      setPicked(null);
                      input.current?.focus();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-btn small error-text"
                    onClick={() => {
                      onRemove(k);
                      setPicked(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div key={k} className="chat-row">
              <div className="bubble bubble-claude">
                <IconSpark />
                <span>{m.text}</span>
              </div>
            </div>
          ),
        )}
        {children}
        <div ref={end} />
      </div>
      <form
        className="sheet-footer composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          className="input composer-input"
          rows={1}
          placeholder={shown.length ? 'Reply…' : placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          autoFocus
        />
        <button className="composer-send" aria-label="Send" disabled={!text.trim()}>
          <IconSend />
        </button>
      </form>
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

/** Claude reading a note, or the changes it read out of it as chips: ✓ applies one, ✕ drops it. */
function NoteExtras({
  reading,
  failed,
  waiting,
  onRetry,
  chips,
  onAccept,
  onDismiss,
}: {
  reading: boolean;
  failed: string | null;
  waiting: string | null;
  onRetry?: () => void;
  chips: NoteSuggestion[];
  onAccept: (k: number) => void;
  onDismiss: (k: number) => void;
}) {
  if (!reading && !failed && !waiting && !chips.length) return null;
  return (
    <div className="note-extras">
      {reading && (
        <div className="note-status small dim">
          <IconSpark /> Reading…
        </div>
      )}
      {!reading && failed && (
        <div className="note-status small">
          <span className="error-text">{failed}</span>
          {onRetry && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {!reading && !failed && waiting && <div className="note-status small dim">{waiting}</div>}
      {chips.length > 0 && (
        <div className="note-chips">
          {chips.map((s, k) => (
            <span key={k} className="note-chip">
              <button type="button" className="note-chip-yes" onClick={() => onAccept(k)}>
                <IconCheck /> {s.label}
              </button>
              <button type="button" className="note-chip-no" aria-label={`Dismiss ${s.label}`} onClick={() => onDismiss(k)}>
                <IconClose />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * An exercise's note on its card (the last two messages; tap to open the chat) and the chips Claude read out of it.
 * A new message is read as soon as Claude is set up and you're online; the note itself always stays.
 */
export function ItemNote({
  ex,
  item,
  update,
  open,
  onOpen,
}: {
  ex: Exercise;
  item: WorkoutItem;
  update: (fn: (w: Workout) => Workout) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const { state, dispatch } = useStore();
  const { ask, ready } = useClaude();
  const online = useOnline();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<{ note: string; msg: string } | null>(null);
  const routine = state.routines.find((r) => r.id === state.active?.routineId && !r.archived);
  const canSwap = !!routine && routine.blocks.some((b) => !b.rehabDose && b.items.some((i) => i.exerciseId === ex.id));
  const thread = threadOf(item);
  const unread = unreadNote(item);
  const failed = error && error.note === item.note ? error.msg : null;

  const read = async () => {
    const note = item.note!;
    const seen = thread.length;
    setReading(true);
    setError(null);
    try {
      const { data } = await ask<{ reply: string; suggestions: RawSuggestion[] }>({
        prompt: notePrompt(item, ex, canSwap),
        schema: NOTE_SCHEMA,
      });
      const suggestions = toSuggestions(data.suggestions, item, ex, getExercise, canSwap);
      const at = new Date().toISOString();
      update((w) => ({
        ...w,
        blocks: w.blocks.map((b) => ({
          ...b,
          items: b.items.map((i) =>
            // a message deleted meanwhile: leave it unread, so it's read again as it is now
            i.id === item.id && threadOf(i).length >= seen ? addReply(i, seen, data.reply ?? '', suggestions, at) : i,
          ),
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
  }, [item.note, unread, ready, online, reading]);

  const accept = (k: number) => {
    const s = item.noteSuggestions![k];
    if (s.kind === 'swap') {
      const next = routine && swapInRoutine(routine, ex.id, s.exerciseId, getExercise);
      if (next) dispatch({ type: 'routineSave', routine: next, now: new Date().toISOString() });
      update((w) => dismissSuggestion(w, item.id, k));
    } else update((w) => applySuggestion(w, item.id, k, state.history, getExercise));
  };

  const extras = (
    <NoteExtras
      reading={reading}
      failed={failed}
      waiting={unread && ready && !online && !reading ? 'Claude will read this when you’re back online.' : null}
      onRetry={ready && online ? () => void read() : undefined}
      chips={item.noteSuggestions ?? []}
      onAccept={accept}
      onDismiss={(k) => update((w) => dismissSuggestion(w, item.id, k))}
    />
  );
  const shown = thread.filter((m) => m.text);
  const recent = shown.slice(-2);

  return (
    <>
      {shown.length > 0 && (
        <div className="note-box">
          <button type="button" className="note-text" onClick={() => onOpen(true)} aria-label="Open note">
            <IconNote />
            <span className="note-lines">
              {shown.length > recent.length && <span className="note-more">{shown.length - recent.length} earlier</span>}
              {recent.map((m, k) => (
                <span key={k} className={m.from === 'claude' ? 'note-line-claude' : undefined}>
                  {m.from === 'claude' && <IconSpark />}
                  {m.text}
                </span>
              ))}
              <span className="note-reply">Reply</span>
            </span>
          </button>
          {!open && extras}
        </div>
      )}
      {open && (
        <NoteChat
          title={`Note · ${ex.name}`}
          thread={thread}
          placeholder="e.g. left shoulder twinged on set 3, used Upstairs 2"
          onSend={(t) => update((w) => addItemNote(w, item.id, t, new Date().toISOString()))}
          onRemove={(k) => update((w) => removeItemNote(w, item.id, k))}
          onClose={() => onOpen(false)}
        >
          {extras}
        </NoteChat>
      )}
    </>
  );
}

/** The session note, or a quiet button to add one. */
export function WorkoutNoteCard({ note, onEdit }: { note?: string; onEdit: () => void }) {
  return note ? (
    <button type="button" className="card note-card" onClick={onEdit} aria-label="Open session note">
      <IconNote />
      <span className="note-pre">{note}</span>
    </button>
  ) : (
    <button type="button" className="btn btn-ghost btn-sm note-add" onClick={onEdit}>
      <IconNote /> Add a session note
    </button>
  );
}
