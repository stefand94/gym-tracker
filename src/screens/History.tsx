import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { IconBack } from '../components/Icons';
import { ConfirmSheet } from '../components/Sheet';
import { getExercise } from '../data/library';
import { MUSCLE_LABELS, MUSCLE_IDS } from '../data/muscles';
import { doneSetCount, duration, exerciseCount, fmtDate, fmtSet } from '../lib/format';
import { workoutLoad } from '../lib/muscleLoad';
import { finishedNewestFirst } from '../lib/prefill';
import { recordsIn } from '../lib/records';
import { describeChanges, routineFromWorkout, routineWithWorkout, sameRoutineLayout } from '../lib/routineEdit';
import { workoutPath } from '../lib/sync';
import { useStore } from '../state/store';
import { NoteChat, WorkoutNoteCard } from '../components/NoteSheet';
import { addNote, removeNote, threadOf } from '../lib/notes';
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
  const [ask, setAsk] = useState(false);
  const [noting, setNoting] = useState(false);
  const [routineAnswer, setRoutineAnswer] = useState<'updated' | 'kept' | null>(null);
  const w = state.history.find((x) => x.id === id);
  if (!w) return <div className="empty">Workout not found.</div>;
  const justFinishedHere = params.get('done') === '1';
  // Finished from a routine but laid out differently: offer to make today's layout the routine's.
  const routine = justFinishedHere ? state.routines.find((r) => r.id === w.routineId && !r.archived && !r.rehab) : undefined;
  const updated = routine && routineAnswer !== 'updated' ? routineWithWorkout(routine, w, state.history, getExercise) : undefined;
  const differs = !!routine && !!updated && !sameRoutineLayout(routine, updated);
  const load = workoutLoad(w, getExercise);
  const hit = MUSCLE_IDS.filter((m) => load[m] > 0).sort((a, b) => load[b] - load[a]);
  const justFinished = params.get('done') === '1';
  const records = recordsIn(w, state.history, getExercise);
  const recordList = w.blocks.flatMap((b) =>
    b.items.flatMap((i) => {
      const ex = getExercise(i.exerciseId);
      const k = records.get(i.id);
      return ex && k ? [{ id: i.id, ex, set: i.sets[k[k.length - 1]] }] : [];
    }),
  );

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

      <WorkoutNoteCard note={w.note} onEdit={() => setNoting(true)} />
      {noting && (
        <NoteChat
          title="Session note"
          thread={threadOf(w)}
          placeholder="How did it go? Energy, sleep, anything that hurt…"
          onSend={(t) => dispatch({ type: 'historyUpdate', workout: addNote(w, t, new Date().toISOString()) })}
          onRemove={(k) => dispatch({ type: 'historyUpdate', workout: removeNote(w, k) })}
          onClose={() => setNoting(false)}
        />
      )}

      {differs && !routineAnswer && (
        <div className="card update-card">
          <div className="routine-name">Update {routine!.name}?</div>
          <div className="small dim">Today was different. {describeChanges(routine!, updated!, getExercise)}.</div>
          <div className="update-actions">
            <button
              className="btn btn-primary grow"
              onClick={() => {
                dispatch({ type: 'routineSave', routine: updated!, now: new Date().toISOString() });
                setRoutineAnswer('updated');
              }}
            >
              Update routine
            </button>
            <button className="btn grow" onClick={() => setRoutineAnswer('kept')}>
              Keep as is
            </button>
          </div>
        </div>
      )}
      {routineAnswer === 'updated' && routine && (
        <div className="card update-card small" role="status">
          ✓ {routine.name} updated. Next time it starts this way.
        </div>
      )}

      {justFinished && recordList.length > 0 && (
        <div className="card records-card" role="status">
          <div className="records-head">
            <span className="pr-badge">PR</span>{' '}
            {recordList.length === 1 ? 'New personal record' : `${recordList.length} new personal records`}
          </div>
          {recordList.map((r) => (
            <div key={r.id} className="records-row">
              <span className="grow">{r.ex.name}</span>
              <span className="records-set">{fmtSet(r.ex, r.set)}</span>
            </div>
          ))}
        </div>
      )}

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
                    {ex?.name ?? i.exerciseId} {i.station && <span className="station-tag">📍 {i.station}</span>}{' '}
                    {i.status === 'skipped' && <span className="badge badge-skip">Skipped</span>}
                    {i.pain !== undefined && <span className="station-tag">pain {i.pain}/10</span>}
                  </div>
                  {i.note && <div className="hist-note note-pre">“{i.note}”</div>}
                  {i.status !== 'skipped' && (
                    <div className="hist-sets">
                      {i.warmups
                        ?.filter((s) => s.done)
                        .map((s, k) => (
                          <span key={`w${k}`} className="hist-set warmup" title="Warm-up">
                            W {fmtSet(ex, s)}
                          </span>
                        ))}
                      {i.sets.map((s, k) => {
                        const pr = s.done && !!records.get(i.id)?.includes(k);
                        return (
                          <span key={k} className={'hist-set' + (s.done ? '' : ' missed') + (pr ? ' pr' : '')}>
                            {fmtSet(ex, s)}
                            {pr && <span className="pr-badge">PR</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {ex && (
                  <Link
                    to={`/progress/${ex.id}`}
                    className="small"
                    style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    Progress
                  </Link>
                )}
              </div>
            );
          }),
        )}
      </div>

      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 20 }}
        onClick={() => nav('/routines/new', { state: { draft: routineFromWorkout(w, getExercise) } })}
      >
        Save as routine
      </button>
      <button className="btn btn-ghost btn-danger btn-block" style={{ marginTop: 8 }} onClick={() => setAsk(true)}>
        Delete workout
      </button>
      {ask && (
        <ConfirmSheet
          title="Delete this workout?"
          body="It's also removed from your GitHub data repo."
          confirmLabel="Delete workout"
          danger
          onConfirm={() => {
            dispatch({ type: 'delete', id: w.id, path: workoutPath(w) });
            nav('/history', { replace: true });
          }}
          onClose={() => setAsk(false)}
        />
      )}
    </div>
  );
}
