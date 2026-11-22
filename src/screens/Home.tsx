import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { AskSheet } from '../components/AskSheet';
import { CheckInCard } from '../components/CheckInCard';
import { IconMore, IconPlus, IconSettings, IconSpark } from '../components/Icons';
import { PainStrip } from '../components/PainStrip';
import { SyncAlert } from '../components/SyncAlert';
import { ConfirmSheet, Sheet } from '../components/Sheet';
import { getExercise, ROUTINES } from '../data/library';
import { doneSetCount, fmtDate, relDay } from '../lib/format';
import { loadSince, workoutLoad } from '../lib/muscleLoad';
import { finishedNewestFirst } from '../lib/prefill';
import { AREA_LABELS, doseItems, morningCheck, rehabState, rehabStatus, STREAK } from '../lib/rehab';
import { newRoutineId } from '../lib/routineEdit';
import { suggest, type Suggestion } from '../lib/suggest';
import { emptyWorkout, workoutFromRoutine, workoutProgress } from '../lib/workout';
import { useStore } from '../state/store';
import { useClaude } from '../state/useClaude';
import type { Routine, Workout } from '../types';

function routineSummary(r: Routine): string {
  return r.blocks
    .flatMap((b) => b.items)
    .map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId)
    .join(' · ');
}

/** The first few exercises and how many more, so the suggested card stays scannable. */
function routineShort(r: Routine, show = 4): string {
  const names = r.blocks.flatMap((b) => b.items).map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId);
  if (names.length <= show + 1) return names.join(' · ');
  return `${names.slice(0, show).join(' · ')} + ${names.length - show} more`;
}

function routineMeta(r: Routine): string {
  return r.description ?? routineSummary(r);
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
  const routines = state.routines.filter((r) => !r.archived);
  const rehab = rehabState(state.history, state.routines);
  const ranked = suggest(routines, state.history, getExercise, rehab);
  const top = !active && ranked[0] && !ranked[0].blocked ? ranked[0] : null;
  const rest: (Suggestion | { routine: Routine; reason?: undefined; blocked?: undefined })[] = [
    ...ranked.filter((s) => s !== top),
    ...routines.filter((r) => r.rehab).map((routine) => ({ routine })),
  ];
  const [menu, setMenu] = useState<Routine | null>(null);
  const [asking, setAsking] = useState(false);
  const { ready: aiReady } = useClaude();
  const [deleting, setDeleting] = useState<Routine | null>(null);
  const duplicate = (r: Routine) => {
    const name = `${r.name} copy`;
    const id = newRoutineId(name, [...state.routines.map((x) => x.id), ...ROUTINES.map((x) => x.id)]);
    dispatch({ type: 'routineSave', routine: { ...r, id, name, rehab: undefined, days: undefined }, now: new Date().toISOString() });
    nav(`/routines/${id}`);
  };
  const startRoutine = (r: Routine) =>
    start(workoutFromRoutine(r, state.history, getExercise, new Date(), (rb) => doseItems(rb, rehab, state.routines, getExercise)));
  const morning = morningCheck(state.history);
  const answerMorning = (v: number | null) => morning && dispatch({ type: 'historyUpdate', workout: { ...morning, nextDayPain: v } });

  return (
    <div>
      <div className="spread title-row">
        <h1 className="page-title">Gym</h1>
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <IconSettings />
        </Link>
      </div>
      <SyncAlert />

      {aiReady && (
        <button className="ask-bar" onClick={() => setAsking(true)}>
          <IconSpark />
          <span className="grow">Ask Claude: plan today, change a routine…</span>
        </button>
      )}
      {asking && <AskSheet from={active ? { kind: 'workout', workout: active } : { kind: 'home' }} onClose={() => setAsking(false)} />}

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

      {morning && (
        <div className="card morning-card">
          <div className="spread">
            <div className="routine-name">How's the {AREA_LABELS[rehab?.area ?? 'hamstring'].toLowerCase()} this morning?</div>
            <button className="link-btn" onClick={() => answerMorning(null)}>
              Skip
            </button>
          </div>
          <div className="small dim">
            After {morning.name}, {relDay(morning.startedAt).toLowerCase()}
          </div>
          <PainStrip label="Pain now" value={undefined} onChange={(v) => v !== undefined && answerMorning(v)} />
        </div>
      )}

      {rehab && !rehab.done && !active && (
        <div className="card rehab-card">
          <div className="rehab-top">
            <div className="routine-name">{AREA_LABELS[rehab.area]} rehab</div>
            <div className="rehab-phase">
              Phase {Math.min(rehab.phase, rehab.maxPhase)} of {rehab.maxPhase}
            </div>
          </div>
          <div className="rehab-dots" aria-hidden>
            {Array.from({ length: STREAK }, (_, i) => (
              <span key={i} className={i < rehab.streak ? 'on' : ''} />
            ))}
          </div>
          <div className={'rehab-status' + (rehab.dropBack ? ' warn' : '')}>{rehabStatus(rehab)}</div>
          {rehab.next && (
            <div className="rehab-foot">
              <button className="link-btn" onClick={() => startRoutine(rehab.next!)}>
                Start {rehab.next.name} ›
              </button>
            </div>
          )}
        </div>
      )}

      {top && (
        <div className="card today">
          <button className="today-main" onClick={() => startRoutine(top.routine)}>
            <div className="today-label">Suggested</div>
            <div className="spread today-top">
              <div className="grow">
                <div className="today-name">{top.routine.name}</div>
                <div className="routine-meta">{top.reason}</div>
              </div>
              <BodyMap load={routineLoad(top.routine)} size="mini" />
            </div>
            <div className="today-list">{routineShort(top.routine)}</div>
            <span className="btn btn-primary btn-block btn-lg today-go">Start {top.routine.name}</span>
          </button>
          <button className="icon-btn card-menu" aria-label={`${top.routine.name} options`} onClick={() => setMenu(top.routine)}>
            <IconMore />
          </button>
        </div>
      )}

      <div className="section-title">{top ? 'Other workouts' : 'Start a workout'}</div>
      <div className="stack">
        {rest.map(({ routine: r, blocked }) => (
          <div key={r.id} className={'card routine' + (blocked ? ' is-later' : '')}>
            <button className="routine-main" onClick={() => startRoutine(r)}>
              <BodyMap load={routineLoad(r)} size="mini" />
              <div className="grow">
                <div className="routine-name">{r.name}</div>
                <div className="routine-meta">
                  {blocked && <span className="later-tag">{blocked}</span>}
                  {routineMeta(r)}
                </div>
              </div>
            </button>
            <button className="icon-btn card-menu" aria-label={`${r.name} options`} onClick={() => setMenu(r)}>
              <IconMore />
            </button>
          </div>
        ))}
        <div className="home-actions">
          <button className="btn grow" onClick={() => nav('/routines/new')}>
            <IconPlus /> New workout
          </button>
          <button className="btn grow" onClick={() => start(emptyWorkout())}>
            Empty workout
          </button>
        </div>
      </div>

      <div className="section-title">Last 7 days</div>
      {!active && <CheckInCard />}

      <Link to="/body" className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <BodyMap load={week} size="small" />
        {Object.values(week).some((v) => v > 0) ? (
          <div className="legend">
            <span>none</span>
            <span className="legend-bar" />
            <span>most sets</span>
          </div>
        ) : (
          <div className="legend-empty">Muscles you train this week light up here.</div>
        )}
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
      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <button
            className="menu-item"
            onClick={() => {
              setMenu(null);
              startRoutine(menu);
            }}
          >
            Start {menu.name}
          </button>
          <button className="menu-item" onClick={() => nav(`/routines/${menu.id}`)}>
            Edit
          </button>
          <button
            className="menu-item"
            onClick={() => {
              setMenu(null);
              duplicate(menu);
            }}
          >
            Duplicate
          </button>
          <button
            className="menu-item danger"
            onClick={() => {
              setDeleting(menu);
              setMenu(null);
            }}
          >
            Delete
          </button>
        </Sheet>
      )}
      {deleting && (
        <ConfirmSheet
          title={`Delete ${deleting.name}?`}
          body="Your logged workouts stay in History."
          confirmLabel="Delete workout"
          cancelLabel="Keep it"
          danger
          onConfirm={() => {
            dispatch({ type: 'routineArchive', id: deleting.id, now: new Date().toISOString() });
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
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
