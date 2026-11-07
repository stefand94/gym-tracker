import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExercisePicker } from '../components/ExercisePicker';
import { IconPlus } from '../components/Icons';
import { WorkoutBlockView } from '../components/WorkoutBlockView';
import { getExercise } from '../data/library';
import { workoutLoad } from '../lib/muscleLoad';
import { addExercise, workoutProgress } from '../lib/workout';
import { useStore } from '../state/store';
import type { Workout } from '../types';

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!startedAt) return '';
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export function WorkoutScreen() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const [picking, setPicking] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const w = state.active;
  const elapsed = useElapsed(w?.startedAt);
  const update = useCallback((fn: (w: Workout) => Workout) => dispatch({ type: 'updateActive', fn }), [dispatch]);

  if (!w) return <Navigate to="/" replace />;

  const prog = workoutProgress(w);
  const load = workoutLoad(w, getExercise);
  const pct = prog.total ? (prog.done / prog.total) * 100 : 0;

  const finish = () => {
    if (prog.done === 0) {
      if (confirm('No sets ticked yet. Discard this workout instead?')) {
        dispatch({ type: 'discard' });
        nav('/');
      }
      return;
    }
    const left = prog.total - prog.done;
    if (left > 0 && !confirm(`${left} set${left > 1 ? 's' : ''} not ticked will be left out. Finish workout?`)) return;
    const id = w.id;
    dispatch({ type: 'finish', now: new Date().toISOString() });
    nav(`/history/${id}?done=1`, { replace: true });
  };

  return (
    <div>
      <div className="wo-header">
        <div className="spread">
          <div className="grow">
            <input
              className="wo-title"
              aria-label="Workout name"
              value={w.name}
              onChange={(e) => update((x) => ({ ...x, name: e.target.value }))}
              style={{ border: 'none', background: 'transparent', padding: 0, width: '100%', outline: 'none' }}
            />
            <div className="small dim num">
              {elapsed} · {prog.done}/{prog.total} sets
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={finish}>
            Finish
          </button>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <button
          className="spread"
          style={{ width: '100%', border: 'none', background: 'none', padding: 0 }}
          onClick={() => setShowMap(!showMap)}
          aria-expanded={showMap}
        >
          <span style={{ fontWeight: 700 }}>Muscles worked so far</span>
          <span className="small dim">{showMap ? 'Hide' : 'Show'}</span>
        </button>
        {showMap && (
          <div style={{ marginTop: 8 }} className="bm-compact">
            <BodyMap load={load} size="small" />
          </div>
        )}
      </div>

      <div className="stack">
        {w.blocks.map((b, i) => (
          <WorkoutBlockView key={b.id} block={b} index={i} count={w.blocks.length} update={update} />
        ))}
      </div>

      {!w.blocks.length && <div className="empty">No exercises yet — add one below.</div>}

      <div className="stack" style={{ marginTop: 16 }}>
        <button className="btn btn-block" onClick={() => setPicking(true)}>
          <IconPlus /> Add exercise
        </button>
        <button className="btn btn-primary btn-block" onClick={finish}>
          Finish workout
        </button>
        <button
          className="btn btn-ghost btn-danger btn-block"
          onClick={() => {
            if (confirm('Discard this workout? Nothing will be saved.')) {
              dispatch({ type: 'discard' });
              nav('/');
            }
          }}
        >
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
    </div>
  );
}
