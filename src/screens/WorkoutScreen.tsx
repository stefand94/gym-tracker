import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExerciseEditor } from '../components/ExerciseEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { HoldWatcher } from '../components/HoldTimer';
import { IconGrip, IconPlus, IconSpark } from '../components/Icons';
import { RestBar, TimerButton } from '../components/RestBar';
import { ConfirmSheet } from '../components/Sheet';
import { useFollowWorkout } from '../components/workout/useFollowWorkout';
import { useLiftBlocks } from '../components/workout/useLiftBlocks';
import { WorkoutBlockView } from '../components/workout/WorkoutBlockView';
import { getExercise } from '../data/library';
import { workoutLoad } from '../lib/muscleLoad';
import { routineFromWorkout } from '../lib/routineEdit';
import { useWakeLock } from '../lib/useWakeLock';
import { addExercise, blockComplete, currentBlockIndex, moveBlock, workoutProgress } from '../lib/workout';
import { useStore } from '../state/store';
import { useClaude } from '../state/useClaude';
import { AskSheet } from '../components/AskSheet';
import { NoteChat, WorkoutNoteCard } from '../components/NoteSheet';
import { addNote, removeNote, threadOf } from '../lib/notes';
import type { Workout } from '../types';

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  return <>{mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`}</>;
}

type Ask = 'finish' | 'discard' | null;

export function WorkoutScreen() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [ask, setAsk] = useState<Ask>(null);
  const [noting, setNoting] = useState(false);
  const [asking, setAsking] = useState(false);
  /** A block is being dragged by its grip: every block shows as one row. */
  const [lifting, setLifting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { ready: aiReady } = useClaude();
  /** Blocks opened or closed by hand; everything else follows "only the current block is open". */
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const headRef = useRef<HTMLDivElement>(null);
  const w = state.active;
  const update = useCallback((fn: (w: Workout) => Workout) => dispatch({ type: 'updateActive', fn }), [dispatch]);
  useWakeLock(!!w);

  const cur = w ? currentBlockIndex(w) : -1;

  const onBlocksDone = useCallback((ids: string[]) => {
    // a finished block folds again, even if it was opened by hand
    setOverride((o) => {
      const n = { ...o };
      for (const id of ids) delete n[id];
      return n;
    });
  }, []);
  useFollowWorkout(w, cur, headRef, onBlocksDone);
  useLiftBlocks(listRef, !!w, setLifting, (from, to) => update((x) => ({ ...x, blocks: moveBlock(x.blocks, from, to) })));

  if (!w) return <Navigate to="/" replace />;

  const prog = workoutProgress(w);
  const load = workoutLoad(w, getExercise);
  const pct = prog.total ? (prog.done / prog.total) * 100 : 0;
  const left = prog.total - prog.done;

  const doFinish = () => {
    const id = w.id;
    dispatch({ type: 'finish', now: new Date().toISOString() });
    nav(`/history/${id}?done=1`, { replace: true });
  };
  const doDiscard = () => {
    dispatch({ type: 'discard' });
    nav('/');
  };
  const finish = () => (prog.done > 0 && left === 0 ? doFinish() : setAsk('finish'));

  const toggle = (id: string, open: boolean) => setOverride((o) => ({ ...o, [id]: !open }));
  let shownNextLabel = false;

  return (
    <div>
      <div className="wo-header" ref={headRef}>
        <div className="spread">
          <div className="grow">
            <input
              className="wo-title"
              aria-label="Workout name"
              value={w.name}
              onChange={(e) => update((x) => ({ ...x, name: e.target.value }))}
            />
            <div className="small dim num">
              <Elapsed startedAt={w.startedAt} /> · <strong className="wo-count">{prog.done}</strong>/{prog.total} sets
            </div>
          </div>
          <TimerButton />
          {/* quiet until most sets are done, so it isn't the loudest thing on screen mid-workout */}
          <button className={'btn' + (prog.total && prog.done >= prog.total * 0.8 ? ' btn-primary' : '')} onClick={finish}>
            Finish
          </button>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <RestBar />
      </div>
      <HoldWatcher />

      {w.note && <WorkoutNoteCard note={w.note} onEdit={() => setNoting(true)} />}

      <div className={'wo-list' + (lifting ? ' is-lifting' : '')} ref={listRef}>
        {w.blocks.map((b, i) => {
          const open = override[b.id] ?? i === cur;
          const upcoming = !open && i > cur && cur >= 0 && !blockComplete(b);
          const label = upcoming && !shownNextLabel;
          if (label) shownNextLabel = true;
          return (
            <div key={b.id} id={`blk-${b.id}`} className="wo-block">
              {label && !lifting && <div className="list-label">Up next</div>}
              {/* the grip stays the same element while the cards fold under it: on iOS, a drag whose element
                  leaves the page stops getting touch moves */}
              <div className="wo-block-body">
                <button
                  type="button"
                  className="grip wo-grip"
                  aria-label={`Drag ${b.items.map((it) => getExercise(it.exerciseId)?.name ?? it.exerciseId).join(' + ')}`}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    update((x) => ({ ...x, blocks: moveBlock(x.blocks, i, i + (e.key === 'ArrowUp' ? -1 : 1)) }));
                  }}
                >
                  <IconGrip />
                </button>
                <WorkoutBlockView
                  block={b}
                  index={i}
                  update={update}
                  open={open}
                  current={i === cur}
                  lifting={lifting}
                  onToggle={() => toggle(b.id, open)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!w.blocks.length && <div className="empty">No exercises yet. Add one below.</div>}
      {w.blocks.length > 0 && cur === -1 && (
        <div className="all-done">
          <strong>All exercises done.</strong>
          <button className="btn btn-primary btn-block btn-lg" onClick={finish}>
            Finish workout
          </button>
        </div>
      )}

      <div className="wo-add-row">
        <button className="btn btn-lg btn-dashed grow" onClick={() => setPicking(true)}>
          <IconPlus /> Add exercise
        </button>
      </div>
      {w.blocks.length > 1 && <p className="small dim wo-hint">Drag ⋮⋮ to move an exercise.</p>}

      <div className="card wo-map">
        <button className="spread map-toggle" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
          <span className="wo-map-title">Muscles worked so far</span>
          <span className="small dim">{showMap ? 'Hide' : 'Show'}</span>
        </button>
        {showMap && (
          <div className="bm-compact wo-map-body">
            <BodyMap load={load} size="small" />
          </div>
        )}
      </div>

      <div className="stack wo-actions">
        {cur !== -1 && (
          <button className="btn btn-primary btn-block btn-lg" onClick={finish}>
            Finish workout
          </button>
        )}
        {aiReady && (
          <button className="btn btn-block ask-btn" onClick={() => setAsking(true)}>
            <IconSpark /> Ask Claude
          </button>
        )}
        {!w.note && (
          <button className="btn btn-ghost btn-block" onClick={() => setNoting(true)}>
            Add a session note
          </button>
        )}
        <button
          className="btn btn-ghost btn-block"
          onClick={() => nav('/routines/new', { state: { draft: routineFromWorkout(w, getExercise) } })}
        >
          Save as routine
        </button>
        <button className="btn btn-ghost btn-danger btn-block" onClick={() => setAsk('discard')}>
          Discard workout
        </button>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            update((x) => addExercise(x, ex, state.history));
            setPicking(false);
            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
          }}
          onCreate={(name) => {
            setPicking(false);
            setCreating(name);
          }}
        />
      )}
      {creating !== null && (
        <ExerciseEditor
          initialName={creating}
          saveLabel="Save & add to workout"
          onClose={() => setCreating(null)}
          onSaved={(ex) => {
            update((x) => addExercise(x, ex, state.history));
            setCreating(null);
            setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
          }}
        />
      )}

      {asking && <AskSheet from={{ kind: 'workout', workout: w }} onClose={() => setAsking(false)} />}
      {noting && (
        <NoteChat
          title="Session note"
          thread={threadOf(w)}
          placeholder="How's it going? Energy, sleep, anything that hurt…"
          onSend={(t) => update((x) => addNote(x, t, new Date().toISOString()))}
          onRemove={(k) => update((x) => removeNote(x, k))}
          onClose={() => setNoting(false)}
        />
      )}

      {ask === 'finish' &&
        (prog.done === 0 ? (
          <ConfirmSheet
            title="No sets ticked yet"
            body="There's nothing to save. Discard this workout?"
            confirmLabel="Discard workout"
            danger
            onConfirm={doDiscard}
            onClose={() => setAsk(null)}
          />
        ) : (
          <ConfirmSheet
            title="Finish workout?"
            body={`${left} set${left === 1 ? '' : 's'} not ticked will be left out.`}
            confirmLabel="Finish and save"
            onConfirm={doFinish}
            onClose={() => setAsk(null)}
          />
        ))}
      {ask === 'discard' && (
        <ConfirmSheet
          title="Discard workout?"
          body="Nothing from this session will be saved."
          confirmLabel="Discard workout"
          danger
          onConfirm={doDiscard}
          onClose={() => setAsk(null)}
        />
      )}
    </div>
  );
}
