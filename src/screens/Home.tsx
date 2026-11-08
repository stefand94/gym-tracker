import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { IconSettings } from '../components/Icons';
import { ConfirmSheet } from '../components/Sheet';
import { getExercise, ROUTINES } from '../data/library';
import { doneSetCount, fmtDate, relDay } from '../lib/format';
import { loadSince, workoutLoad } from '../lib/muscleLoad';
import { finishedNewestFirst } from '../lib/prefill';
import { daysLabel, todaysRoutine } from '../lib/schedule';
import { emptyWorkout, workoutFromRoutine, workoutProgress } from '../lib/workout';
import { useStore } from '../state/store';
import type { Routine, Workout } from '../types';

function routineSummary(r: Routine): string {
  return r.blocks
    .flatMap((b) => b.items)
    .map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId)
    .join(' · ');
}

function routineMeta(r: Routine): string {
  return [daysLabel(r.days), r.description ?? routineSummary(r)].filter(Boolean).join(' · ');
}

function routineLoad(r: Routine) {
  const fake: Workout = {
    id: '',
    name: '',
    startedAt: '',
    blocks: r.blocks.map((b) => ({
      id: '',
      superset: false,
      items: b.items.map((i) => ({ id: '', exerciseId: i.exerciseId, status: 'pending', sets: [{ done: true }] })),
    })),
  };
  return workoutLoad(fake, getExercise);
}

export function Home() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const recent = finishedNewestFirst(state.history).slice(0, 3);
  const week = loadSince(state.history, 7, getExercise);

  const [pending, setPending] = useState<Workout | null>(null);
  const begin = (w: Workout) => {
    dispatch({ type: 'start', workout: w });
    nav('/workout');
  };
  const start = (w: Workout) => (state.active ? setPending(w) : begin(w));

  const active = state.active;
  const prog = active ? workoutProgress(active) : null;
  const today = active ? null : todaysRoutine(ROUTINES, state.history);
  const others = ROUTINES.filter((r) => r !== today);
  const startRoutine = (r: Routine) => start(workoutFromRoutine(r, state.history, getExercise));

  return (
    <div>
      <div className="spread title-row">
        <h1 className="page-title">Gym</h1>
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <IconSettings />
        </Link>
      </div>

      {active && prog && (
        <Link to="/workout" className="card resume">
          <div className="spread">
            <div>
              <div className="small dim">In progress · started {fmtDate(active.startedAt, { hour: 'numeric', minute: '2-digit' })}</div>
              <div className="routine-name">{active.name}</div>
            </div>
            <div className="num" style={{ fontWeight: 800, fontSize: 20 }}>
              {prog.done}/{prog.total}
            </div>
          </div>
          <div style={{ marginTop: 8, fontWeight: 700 }}>Resume workout →</div>
        </Link>
      )}

      {today && (
        <button className="card today" onClick={() => startRoutine(today)}>
          <div className="today-label">Today</div>
          <div className="spread today-top">
            <div className="grow">
              <div className="today-name">{today.name}</div>
              <div className="routine-meta">{today.description ?? daysLabel(today.days)}</div>
            </div>
            <BodyMap load={routineLoad(today)} size="mini" />
          </div>
          <div className="today-list">{routineSummary(today)}</div>
          <span className="btn btn-primary btn-block btn-lg today-go">Start {today.name}</span>
        </button>
      )}

      <div className="section-title">{today ? 'Other workouts' : 'Start a workout'}</div>
      <div className="stack">
        {others.map((r) => (
          <button key={r.id} className="card routine" onClick={() => startRoutine(r)}>
            <BodyMap load={routineLoad(r)} size="mini" />
            <div className="grow">
              <div className="routine-name">{r.name}</div>
              <div className="routine-meta">{routineMeta(r)}</div>
            </div>
          </button>
        ))}
        <button className="btn btn-block" onClick={() => start(emptyWorkout())}>
          Empty workout
        </button>
      </div>

      <div className="section-title">Last 7 days</div>
      <Link to="/body" className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <BodyMap load={week} size="small" />
        <div className="legend">
          <span>none</span>
          <span className="legend-bar" />
          <span>most sets</span>
        </div>
      </Link>

      {recent.length > 0 && (
        <>
          <div className="section-title">Recent</div>
          <div className="card list-card">
            {recent.map((w) => (
              <Link key={w.id} to={`/history/${w.id}`} className="list-row">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{w.name}</div>
                  <div className="small dim">
                    {relDay(w.startedAt)} · {doneSetCount(w)} sets
                  </div>
                </div>
                <BodyMap load={workoutLoad(w, getExercise)} size="mini" />
              </Link>
            ))}
          </div>
        </>
      )}
      {pending && (
        <ConfirmSheet
          title="Start a new workout?"
          body={`${state.active?.name ?? 'Your workout'} is still in progress. Starting ${pending.name} discards it.`}
          confirmLabel={`Discard and start ${pending.name}`}
          danger
          onConfirm={() => {
            setPending(null);
            begin(pending);
          }}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
