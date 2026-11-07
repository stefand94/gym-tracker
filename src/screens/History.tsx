import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { IconBack } from '../components/Icons';
import { getExercise } from '../data/library';
import { MUSCLE_LABELS, MUSCLE_IDS } from '../data/muscles';
import { doneSetCount, duration, exerciseCount, fmtDate, fmtSet } from '../lib/format';
import { workoutLoad } from '../lib/muscleLoad';
import { finishedNewestFirst } from '../lib/prefill';
import { workoutPath } from '../lib/sync';
import { useStore } from '../state/store';
import type { Workout } from '../types';

export function HistoryList() {
  const { state } = useStore();
  const list = finishedNewestFirst(state.history);
  const groups = new Map<string, Workout[]>();
  for (const w of list) {
    const k = fmtDate(w.startedAt, { month: 'long', year: 'numeric' });
    groups.set(k, [...(groups.get(k) ?? []), w]);
  }
  return (
    <div>
      <h1 className="page-title">History</h1>
      {!list.length && <div className="card empty">No workouts yet. Finish one and it’ll show up here.</div>}
      {[...groups.entries()].map(([month, ws]) => (
        <div key={month}>
          <div className="section-title">
            {month} · {ws.length} workout{ws.length > 1 ? 's' : ''}
          </div>
          <div className="card list-card">
            {ws.map((w) => (
              <Link key={w.id} to={`/history/${w.id}`} className="list-row">
                <div className="grow">
                  <div style={{ fontWeight: 700 }} className="truncate">
                    {w.name}
                  </div>
                  <div className="small dim">
                    {fmtDate(w.startedAt)} · {exerciseCount(w)} exercises · {doneSetCount(w)} sets · {duration(w)}
                  </div>
                </div>
                <BodyMap load={workoutLoad(w, getExercise)} size="mini" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const w = state.history.find((x) => x.id === id);
  if (!w) return <div className="empty">Workout not found.</div>;
  const load = workoutLoad(w, getExercise);
  const hit = MUSCLE_IDS.filter((m) => load[m] > 0).sort((a, b) => load[b] - load[a]);
  const justFinished = params.get('done') === '1';

  return (
    <div>
      <div className="row" style={{ marginLeft: -10 }}>
        <button className="icon-btn" aria-label="Back" onClick={() => (justFinished ? nav('/') : nav(-1))}>
          <IconBack />
        </button>
        <span className="dim small">{justFinished ? 'Workout saved' : 'History'}</span>
      </div>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        {w.name}
      </h1>
      <div className="dim small" style={{ marginTop: -10, marginBottom: 16 }}>
        {fmtDate(w.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {duration(w)}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-v">{exerciseCount(w)}</div>
          <div className="stat-l">exercises</div>
        </div>
        <div className="stat">
          <div className="stat-v">{doneSetCount(w)}</div>
          <div className="stat-l">sets</div>
        </div>
        <div className="stat">
          <div className="stat-v">{hit.length}</div>
          <div className="stat-l">muscle groups</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <BodyMap load={load} size="large" labels />
        <div className="small dim" style={{ textAlign: 'center', marginTop: 8 }}>
          {hit.map((m) => MUSCLE_LABELS[m]).join(' · ') || 'No sets ticked'}
        </div>
      </div>

      <div className="section-title">Exercises</div>
      <div className="card list-card">
        {w.blocks.flatMap((b) =>
          b.items.map((i, n) => {
            const ex = getExercise(i.exerciseId);
            return (
              <div key={i.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>
                    {b.superset && <span className="ss-tag">SS{n + 1} </span>}
                    {ex?.name ?? i.exerciseId}{' '}
                    {i.status === 'skipped' && <span className="badge badge-skip">Skipped</span>}
                  </div>
                  {i.status !== 'skipped' && (
                    <div className="hist-sets">
                      {i.sets.map((s, k) => (
                        <span key={k} className={'hist-set' + (s.done ? '' : ' missed')}>
                          {fmtSet(ex, s)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {ex && (
                  <Link to={`/progress/${ex.id}`} className="small" style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Progress
                  </Link>
                )}
              </div>
            );
          }),
        )}
      </div>

      <button
        className="btn btn-ghost btn-danger btn-block"
        style={{ marginTop: 20 }}
        onClick={() => {
          if (confirm('Delete this workout? This also removes it from your GitHub data repo.')) {
            dispatch({ type: 'delete', id: w.id, path: workoutPath(w) });
            nav('/history', { replace: true });
          }
        }}
      >
        Delete workout
      </button>
    </div>
  );
}
