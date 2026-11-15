import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExercise } from '../data/library';
import {
  askPrompt,
  ASK_SCHEMA,
  blocksToAppend,
  EXAMPLES,
  readAnswer,
  type AskFrom,
  type AskResult,
  type AskTurn,
  type RawAnswer,
} from '../lib/ask';
import { MODEL_LABELS } from '../lib/claude';
import { doseItems, rehabState } from '../lib/rehab';
import { describeChanges } from '../lib/routineEdit';
import { workoutFromRoutine } from '../lib/workout';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Routine, RoutineBlock, RoutineItem } from '../types';
import { IconSend, IconSpark } from './Icons';
import { Sheet } from './Sheet';

function itemLine(i: RoutineItem): string {
  const ex = getExercise(i.exerciseId);
  const amount = i.seconds ? `${i.seconds}s` : i.reps ? `${i.reps}` : '';
  const dose = [
    i.sets && amount ? `${i.sets} × ${amount}` : i.sets ? `${i.sets} sets` : amount,
    i.weight !== undefined ? `${i.weight} kg` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `${ex?.name ?? i.exerciseId}${dose ? ` — ${dose}` : ''}`;
}

/** The plan as a short list: supersets grouped, the rehab dose as one line. */
export function PlanPreview({ blocks }: { blocks: RoutineBlock[] }) {
  return (
    <ol className="plan">
      {blocks.map((b, n) =>
        b.rehabDose ? (
          <li key={n} className="plan-dose">
            Hamstring dose <span className="dim">(follows your rehab phase)</span>
          </li>
        ) : (
          <li key={n} className={b.superset ? 'plan-ss' : ''}>
            {b.superset && <span className="badge badge-ss">Superset</span>}
            {b.items.map((i, k) => (
              <div key={k}>{itemLine(i)}</div>
            ))}
          </li>
        ),
      )}
    </ol>
  );
}

type ChatTurn = AskTurn & { error?: string; done?: string };

// The chat stays while the app is open: close the sheet, come back, carry on. "New chat" clears it.
const chats = new Map<string, ChatTurn[]>();
const chatKey = (from: AskFrom) =>
  from.kind === 'home' ? 'home' : from.kind === 'workout' ? `workout:${from.workout.id}` : `routine:${from.routine.id ?? 'new'}`;

/**
 * Ask Claude, as a chat: change a routine, a workout for today, a new routine, or just a question — then follow up
 * ("swap the curls", "make it 30 min"). Nothing is saved until you tap. In the routine editor, plans go into the editor.
 */
export function AskSheet({
  from,
  onClose,
  onUseInEditor,
}: {
  from: AskFrom;
  onClose: () => void;
  onUseInEditor?: (name: string, blocks: RoutineBlock[]) => void;
}) {
  const { state, dispatch } = useStore();
  const { ask, ready } = useClaude();
  const nav = useNavigate();
  const key = chatKey(from);
  const [turns, setTurns] = useState<ChatTurn[]>(() => chats.get(key) ?? []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    chats.set(key, turns);
    end.current?.closest('.sheet')?.scrollTo({ top: 1e6 });
  }, [key, turns, busy]);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);
  const rehab = rehabState(state.history, state.routines);

  const patch = (k: number, p: Partial<ChatTurn>) => setTurns((ts) => ts.map((t, n) => (n === k ? { ...t, ...p } : t)));

  const send = async (q: string, base = turns) => {
    if (!q.trim() || busy) return;
    const k = base.length;
    const earlier = base.filter((t) => t.result);
    setTurns([...base, { q: q.trim() }]);
    setText('');
    setBusy(true);
    abort.current = new AbortController();
    try {
      const { data } = await ask<RawAnswer>({
        prompt: askPrompt(q, from, getExercise, earlier),
        schema: ASK_SCHEMA,
        use: 'ask',
        withToday: true,
        effort: 'medium',
        signal: abort.current.signal,
      });
      patch(k, { result: readAnswer(data, { from, routines: state.routines, rehab, lookup: getExercise }) });
    } catch (e) {
      if (abort.current?.signal.aborted) {
        // cancelled: take the question back into the box
        setTurns((ts) => ts.slice(0, k));
        setText(q);
      } else patch(k, { error: aiMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const now = () => new Date().toISOString();
  const asWorkout = (r: AskResult) => {
    const temp: Routine = { id: '', name: r.name, blocks: r.blocks };
    const w = workoutFromRoutine(temp, state.history, getExercise, new Date(), (rb) => doseItems(rb, rehab, state.routines));
    delete w.routineId;
    return w;
  };
  const startNow = (r: AskResult) => {
    dispatch({ type: 'start', workout: asWorkout(r) });
    chats.delete(key);
    onClose();
    nav('/workout');
  };
  const addToWorkout = (k: number, r: AskResult) => {
    const extra = asWorkout({ ...r, blocks: state.active ? blocksToAppend(r.blocks, state.active) : r.blocks }).blocks;
    dispatch({ type: 'updateActive', fn: (w) => ({ ...w, blocks: [...w.blocks, ...extra] }) });
    patch(k, { done: `Added ${extra.reduce((n, b) => n + b.items.length, 0)} exercises to the end of your workout.` });
  };
  const openNew = (r: AskResult) => {
    onClose();
    nav('/routines/new', { state: { draft: { name: r.name, blocks: r.blocks } } });
  };
  const apply = (k: number, r: AskResult) => {
    dispatch({ type: 'routineSave', routine: { ...r.routine!, blocks: r.blocks }, now: now() });
    patch(k, { done: `✓ ${r.routine!.name} updated. Next time it starts this way.` });
  };
  const editFirst = (r: AskResult) => {
    onClose();
    nav(`/routines/${r.routine!.id}`, { state: { draft: { ...r.routine!, blocks: r.blocks } } });
  };

  const model = MODEL_LABELS[state.ai.askModel];
  const latest = turns.map((t) => !!t.result).lastIndexOf(true);
  const inEditor = from.kind === 'routine' && !!onUseInEditor;
  const midWorkout = from.kind === 'workout' || !!state.active;

  const actions = (k: number, result: AskResult) => (
    <div className="stack ask-actions">
      {inEditor ? (
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            onUseInEditor!(result.name, result.blocks);
            onClose();
          }}
        >
          Use in the editor
        </button>
      ) : result.kind === 'change' && result.routine ? (
        <div className="row">
          <button className="btn btn-primary grow" onClick={() => apply(k, result)}>
            Apply
          </button>
          <button className="btn grow" onClick={() => editFirst(result)}>
            Edit first
          </button>
        </div>
      ) : midWorkout ? (
        <>
          <button className="btn btn-primary btn-block" onClick={() => addToWorkout(k, result)}>
            Add to this workout
          </button>
          <button className="btn btn-block" onClick={() => openNew(result)}>
            Save as a routine
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-primary btn-block" onClick={() => startNow(result)}>
            Start now
          </button>
          <button className="btn btn-block" onClick={() => openNew(result)}>
            {result.kind === 'new' ? 'Open in the routine builder' : 'Save as a routine'}
          </button>
        </>
      )}
    </div>
  );

  if (!ready)
    return (
      <Sheet title="Ask Claude" onClose={onClose}>
        <div className="stack">
          <p className="dim">Add your Claude API key in Settings to ask for plans and changes.</p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => {
              onClose();
              nav('/settings');
            }}
          >
            Open Settings
          </button>
        </div>
      </Sheet>
    );

  return (
    <Sheet title="Ask Claude" onClose={onClose} tall>
      <div className="chat">
        {turns.length > 0 && !busy && (
          <button
            type="button"
            className="link-btn small chat-new"
            onClick={() => {
              setTurns([]);
              chats.delete(key);
              input.current?.focus();
            }}
          >
            New chat
          </button>
        )}
        {turns.length === 0 && (
          <div className="ask-examples">
            {EXAMPLES.map((x) => (
              <button type="button" key={x} className="chip" onClick={() => void send(x)}>
                {x}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, k) => {
          const r = t.result;
          return (
            <div key={k} className="chat-turn">
              <div className="chat-row chat-me">
                <div className="bubble bubble-me">{t.q}</div>
              </div>
              {r && (
                <div className="ask-result">
                  {r.reason && <div className="ask-reason">{r.reason}</div>}
                  {r.answer && <p className="ask-answer">{r.answer}</p>}
                  {r.blocks.length > 0 && (
                    <>
                      <div className="ask-plan-head">
                        {r.kind === 'change' && r.routine ? `New ${r.routine.name}` : r.kind === 'today' ? `For today: ${r.name}` : r.name}
                      </div>
                      {r.kind === 'change' && r.routine && (
                        <div className="small dim">{describeChanges(r.routine, { ...r.routine, blocks: r.blocks }, getExercise)}.</div>
                      )}
                      <PlanPreview blocks={r.blocks} />
                    </>
                  )}
                  {r.dropped.length > 0 && (
                    <ul className="ask-dropped small dim">
                      {r.dropped.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {t.done ? (
                    <div className="card update-card small" role="status">
                      {t.done}
                    </div>
                  ) : (
                    r.blocks.length > 0 && k === latest && actions(k, r)
                  )}
                </div>
              )}
              {t.error && (
                <div className="ask-error">
                  <span className="error-text">{t.error}</span>{' '}
                  {k === turns.length - 1 && !busy && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void send(t.q, turns.slice(0, k))}>
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="ask-busy small dim">
            <span>
              <IconSpark /> {model} is looking at your last 4 weeks…
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>
              Cancel
            </button>
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="sheet-footer composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          ref={input}
          className="input composer-input"
          rows={1}
          placeholder={turns.length ? 'Reply…' : 'e.g. I want more shoulders — restructure Upper A'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          autoFocus
        />
        <button className="composer-send" aria-label="Send" disabled={busy || !text.trim()}>
          <IconSend />
        </button>
      </form>
    </Sheet>
  );
}
