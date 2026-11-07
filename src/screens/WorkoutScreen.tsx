import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExercisePicker } from '../components/ExercisePicker';
import { IconPlus } from '../components/Icons';
import { RestBar, TimerButton } from '../components/RestBar';
import { ConfirmSheet } from '../components/Sheet';
import { WorkoutBlockView } from '../components/WorkoutBlockView';
import { getExercise } from '../data/library';
import { workoutLoad } from '../lib/muscleLoad';
import { useWakeLock } from '../lib/useWakeLock';
import { addExercise, blockComplete, currentBlockIndex, workoutProgress } from '../lib/workout';
import { useStore } from '../state/store';
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
  const [showMap, setShowMap] = useState(true);
  const [ask, setAsk] = useState<Ask>(null);
  /** Blocks opened or closed by hand; everything else follows "only the current block is open". */
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const headRef = useRef<HTMLDivElement>(null);
  const w = state.active;
  const update = useCallback((fn: (w: Workout) => Workout) => dispatch({ type: 'updateActive', fn }), [dispatch]);
  useWakeLock(!!w);

  const cur = w ? currentBlockIndex(w) : -1;
  const curId = cur >= 0 ? w!.blocks[cur].id : null;

  const scrollToBlock = useCallback((id: string, smooth = true) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`blk-${id}`);
      if (!el) return;
      const head = headRef.current?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top + window.scrollY - head - 10;
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  // Coming back to the workout: jump straight to where you are.
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (landed.current || !curId || cur === 0) return;
    landed.current = true;
    // after App's scroll-to-top on route change
    setTimeout(() => scrollToBlock(curId, false), 0);
  }, [curId, cur, scrollToBlock]);

  // When a block is finished: fold it away and move to the next one.
  const doneIds = w ? w.blocks.filter(blockComplete).map((b) => b.id) : [];
  const doneKey = doneIds.join(',');
  const prevDone = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(doneKey ? doneKey.split(',') : []);
    const before = prevDone.current;
    prevDone.current = now;
    if (!before) return;
    const fresh = [...now].filter((id) => !before.has(id));
    if (!fresh.length) return;
    setOverride((o) => {
      const n = { ...o };
      for (const id of fresh) delete n[id];
      return n;
    });
    if (curId) scrollToBlock(curId);
  }, [doneKey, curId, scrollToBlock]);

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
          <button className="btn btn-primary" onClick={finish}>
            Finish
          </button>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <RestBar />
      </div>

      <div className="wo-list">
        {w.blocks.map((b, i) => {
          const open = override[b.id] ?? i === cur;
          const upcoming = !open && i > cur && cur >= 0 && !blockComplete(b);
          const label = upcoming && !shownNextLabel;
          if (label) shownNextLabel = true;
          return (
            <div key={b.id} id={`blk-${b.id}`} className="wo-block">
              {label && <div className="list-label">Up next</div>}
              <WorkoutBlockView
                block={b}
                index={i}
                count={w.blocks.length}
                update={update}
                open={open}
                current={i === cur}
                onToggle={() => toggle(b.id, open)}
              />
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

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn btn-block btn-lg btn-dashed" onClick={() => setPicking(true)}>
          <IconPlus /> Add exercise
        </button>
      </div>

      <div className="card" style={{ marginTop: 16, padding: '10px 14px' }}>
        <button className="spread map-toggle" onClick={() => setShowMap(!showMap)} aria-expanded={showMap}>
          <span style={{ fontWeight: 700 }}>Muscles worked so far</span>
          <span className="small dim">{showMap ? 'Hide' : 'Show'}</span>
        </button>
        {showMap && (
          <div style={{ marginTop: 8 }} className="bm-compact">
            <BodyMap load={load} size="small" />
          </div>
        )}
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        {cur !== -1 && (
          <button className="btn btn-primary btn-block btn-lg" onClick={finish}>
            Finish workout
          </button>
        )}
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
