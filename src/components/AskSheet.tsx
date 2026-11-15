import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExercise } from '../data/library';
import { askPrompt, ASK_SCHEMA, blocksToAppend, EXAMPLES, readAnswer, type AskFrom, type AskResult, type RawAnswer } from '../lib/ask';
import { MODEL_LABELS } from '../lib/claude';
import { doseItems, rehabState } from '../lib/rehab';
import { describeChanges } from '../lib/routineEdit';
import { workoutFromRoutine } from '../lib/workout';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Routine, RoutineBlock, RoutineItem } from '../types';
import { IconSpark } from './Icons';
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

/**
 * Ask Claude for a plan: change a routine, a workout for today, or a new routine — or just a question.
 * Nothing is saved until you tap. In the routine editor, plans go into the editor instead.
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
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const rehab = rehabState(state.history, state.routines);

  const send = async (q = question) => {
    if (!q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setError(null);
    setResult(null);
    setDone(null);
    abort.current = new AbortController();
    try {
      const { data } = await ask<RawAnswer>({
        prompt: askPrompt(q, from, getExercise),
        schema: ASK_SCHEMA,
        use: 'ask',
        withToday: true,
        effort: 'medium',
        signal: abort.current.signal,
      });
      setResult(readAnswer(data, { from, routines: state.routines, rehab, lookup: getExercise }));
    } catch (e) {
      if (!abort.current?.signal.aborted) setError(aiMessage(e));
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
    onClose();
    nav('/workout');
  };
  const addToWorkout = (r: AskResult) => {
    const extra = asWorkout({ ...r, blocks: state.active ? blocksToAppend(r.blocks, state.active) : r.blocks }).blocks;
    dispatch({ type: 'updateActive', fn: (w) => ({ ...w, blocks: [...w.blocks, ...extra] }) });
    setDone(`Added ${extra.reduce((n, b) => n + b.items.length, 0)} exercises to the end of your workout.`);
  };
  const openNew = (r: AskResult) => {
    onClose();
    nav('/routines/new', { state: { draft: { name: r.name, blocks: r.blocks } } });
  };
  const apply = (r: AskResult) => {
    dispatch({ type: 'routineSave', routine: { ...r.routine!, blocks: r.blocks }, now: now() });
    setDone(`✓ ${r.routine!.name} updated. Next time it starts this way.`);
  };
  const editFirst = (r: AskResult) => {
    onClose();
    nav(`/routines/${r.routine!.id}`, { state: { draft: { ...r.routine!, blocks: r.blocks } } });
  };

  const model = MODEL_LABELS[state.ai.askModel];
  const inEditor = from.kind === 'routine' && !!onUseInEditor;
  const midWorkout = from.kind === 'workout' || !!state.active;

  return (
    <Sheet title="Ask Claude" onClose={onClose} tall>
      {!ready ? (
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
      ) : (
        <>
          <form
            className="ask-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              className="input note-input"
              rows={3}
              placeholder="e.g. I want more shoulders — restructure Upper A"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              autoFocus
            />
            {!result && !busy && (
              <div className="ask-examples">
                {EXAMPLES.map((x) => (
                  <button type="button" key={x} className="chip" onClick={() => void send(x)}>
                    {x}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || !question.trim()}>
              <IconSpark /> {busy ? 'Thinking…' : result ? 'Ask again' : 'Ask'}
            </button>
          </form>

          {busy && (
            <div className="ask-busy small dim">
              {model} is looking at your last 4 weeks…
              <button className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </div>
          )}
          {error && <div className="error-text ask-error">{error}</div>}

          {result && (
            <div className="ask-result">
              {result.reason && <div className="ask-reason">{result.reason}</div>}
              {result.answer && <p className="ask-answer">{result.answer}</p>}
              {result.blocks.length > 0 && (
                <>
                  <div className="ask-plan-head">
                    {result.kind === 'change' && result.routine
                      ? `New ${result.routine.name}`
                      : result.kind === 'today'
                        ? `For today: ${result.name}`
                        : result.name}
                  </div>
                  {result.kind === 'change' && result.routine && (
                    <div className="small dim">
                      {describeChanges(result.routine, { ...result.routine, blocks: result.blocks }, getExercise)}.
                    </div>
                  )}
                  <PlanPreview blocks={result.blocks} />
                </>
              )}
              {result.dropped.length > 0 && (
                <ul className="ask-dropped small dim">
                  {result.dropped.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}

              {done ? (
                <div className="card update-card small" role="status">
                  {done}
                </div>
              ) : (
                result.blocks.length > 0 && (
                  <div className="stack ask-actions">
                    {inEditor ? (
                      <button
                        className="btn btn-primary btn-block btn-lg"
                        onClick={() => {
                          onUseInEditor!(result.name, result.blocks);
                          onClose();
                        }}
                      >
                        Use in the editor
                      </button>
                    ) : result.kind === 'change' && result.routine ? (
                      <div className="row">
                        <button className="btn btn-primary grow" onClick={() => apply(result)}>
                          Apply
                        </button>
                        <button className="btn grow" onClick={() => editFirst(result)}>
                          Edit first
                        </button>
                      </div>
                    ) : midWorkout ? (
                      <>
                        <button className="btn btn-primary btn-block btn-lg" onClick={() => addToWorkout(result)}>
                          Add to this workout
                        </button>
                        <button className="btn btn-block" onClick={() => openNew(result)}>
                          Save as a routine
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-primary btn-block btn-lg" onClick={() => startNow(result)}>
                          Start now
                        </button>
                        <button className="btn btn-block" onClick={() => openNew(result)}>
                          {result.kind === 'new' ? 'Open in the routine builder' : 'Save as a routine'}
                        </button>
                      </>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
