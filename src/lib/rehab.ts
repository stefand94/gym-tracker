import type { Exercise, RehabArea, Routine, RoutineBlock, RoutineItem, Workout } from '../types';

/** Pain during a session at or below this counts as a good session. */
const GOOD_MAX = 2;
/** Pain above this (during, or the next morning) means go back a phase. */
const BAD_ABOVE = 3;
/** Good sessions in a row needed to move up. */
export const STREAK = 2;

export const AREA_LABELS: Record<RehabArea, string> = { hamstring: 'Hamstring' };

/** Highest pain logged in a workout, or undefined if none was logged. */
function sessionPain(w: Workout): number | undefined {
  const p = w.blocks.flatMap((b) => b.items).flatMap((i) => (i.status !== 'skipped' && i.pain !== undefined ? [i.pain] : []));
  return p.length ? Math.max(...p) : undefined;
}

function tracksPain(w: Workout): boolean {
  return w.blocks.some((b) => b.items.some((i) => i.trackPain || i.pain !== undefined));
}

export type Verdict = 'good' | 'bad' | 'ok' | 'unknown';

/** good: ≤2 and not worse next morning · bad: >3, or worse next morning (above 2) · ok: in between. */
export function verdict(w: Workout): Verdict {
  const p = sessionPain(w);
  const next = w.nextDayPain ?? undefined;
  const worse = next !== undefined && next > Math.max(p ?? 0, GOOD_MAX);
  if ((p !== undefined && p > BAD_ABOVE) || worse) return 'bad';
  if (p === undefined) return 'unknown';
  return p <= GOOD_MAX ? 'good' : 'ok';
}

export interface RehabState {
  area: RehabArea;
  /** Phase you're on (1…maxPhase), or maxPhase + 1 once the last phase is passed. */
  phase: number;
  maxPhase: number;
  /** Good sessions in a row at the current phase, newest first. */
  streak: number;
  ready: boolean;
  dropBack: boolean;
  /** All phases passed: back to normal training. */
  done: boolean;
  /** The routine to do next (current phase, the next one when ready, the previous one when dropping back). */
  next?: Routine;
}

const phaseRoutines = (routines: Routine[], area: RehabArea) =>
  routines.filter((r) => r.rehab?.area === area && !r.archived).sort((a, b) => a.rehab!.phase - b.rehab!.phase);

/**
 * Where the rehab stands, derived from history: the phase is that of the most recent phase session;
 * move up after STREAK good sessions in a row there; drop back when the latest pain-tracked workout went badly.
 */
export function rehabState(history: Workout[], routines: Routine[], area: RehabArea = 'hamstring'): RehabState | null {
  const phases = phaseRoutines(routines, area);
  if (!phases.length) return null;
  const maxPhase = phases[phases.length - 1].rehab!.phase;
  const phaseOf = new Map(phases.map((r) => [r.id, r.rehab!.phase]));
  const finished = history.filter((w) => w.finishedAt).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const sessions = finished.filter((w) => w.routineId && phaseOf.has(w.routineId));

  let phase = sessions.length ? phaseOf.get(sessions[0].routineId!)! : phases[0].rehab!.phase;
  let streak = 0;
  for (const w of sessions) {
    if (phaseOf.get(w.routineId!) !== phase) break;
    const v = verdict(w);
    if (v === 'good') streak++;
    else if (v !== 'unknown') break;
  }
  const latestTracked = finished.find(tracksPain);
  const dropBack = !!latestTracked && verdict(latestTracked) === 'bad' && phase > phases[0].rehab!.phase;
  let ready = !dropBack && streak >= STREAK;
  let done = false;
  if (ready && phase >= maxPhase) {
    done = true;
    ready = false;
    phase = maxPhase + 1;
  }
  const want = dropBack ? phase - 1 : ready ? phase + 1 : phase;
  return { area, phase, maxPhase, streak, ready, dropBack, done, next: phases.find((r) => r.rehab!.phase === want) };
}

/** Prevention dose once rehab is done. */
const MAINTENANCE: Record<RehabArea, RoutineItem[]> = {
  hamstring: [{ exerciseId: 'nordic-curl', sets: 2, reps: 4, trackPain: true }],
};

/** The dose block a routine starts with, for when no routine has one (the app's own daily workout, say). */
export const DEFAULT_DOSE: Record<RehabArea, RoutineBlock> = {
  hamstring: {
    superset: true,
    rehabDose: 'hamstring',
    items: [
      { exerciseId: 'hamstring-iso-bridge', sets: 3, seconds: 30 },
      { exerciseId: 'glute-bridge', sets: 2, reps: 12 },
    ],
  },
};

/** The rehab dose block to use: a live routine's, else an archived one's, else the default. */
export function findDoseBlock(routines: Routine[], area: RehabArea): RoutineBlock {
  const live = routines.filter((r) => !r.archived);
  for (const list of [live, routines])
    for (const r of list) {
      const b = r.blocks.find((x) => x.rehabDose === area);
      if (b) return b;
    }
  return DEFAULT_DOSE[area];
}

/**
 * Items for a `rehabDose` block: as written while on phase 1; later the first two exercises of the
 * phase you're on (one back if dropping back) at 2 sets; the maintenance dose once done.
 */
export function doseItems(
  block: RoutineBlock,
  state: RehabState | null,
  routines: Routine[],
  /** Lets the dose skip interval work (walk–jog stays in the phase session). */
  lookup?: (id: string) => Exercise | undefined,
): RoutineItem[] {
  if (!block.rehabDose || !state || state.area !== block.rehabDose) return block.items;
  if (state.done) return MAINTENANCE[block.rehabDose];
  const phase = state.dropBack ? state.phase - 1 : state.phase;
  const source = phaseRoutines(routines, state.area).find((r) => r.rehab!.phase === phase);
  if (phase <= 1 || !source) return block.items;
  return source.blocks
    .flatMap((b) => b.items)
    .filter((i) => !lookup?.(i.exerciseId)?.intervals)
    .slice(0, 2)
    .map((i) => ({ ...i, sets: Math.min(i.sets ?? 2, 2), trackPain: true }));
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * The workout to ask "how is it this morning?" about: the latest finished pain-tracked workout from an
 * earlier day (up to 2 days back) that hasn't been answered or dismissed yet.
 */
export function morningCheck(history: Workout[], now = new Date()): Workout | undefined {
  const latest = history.filter((w) => w.finishedAt && tracksPain(w)).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  if (!latest || latest.nextDayPain !== undefined) return undefined;
  const started = new Date(latest.startedAt);
  if (dayKey(started) === dayKey(now)) return undefined;
  return now.getTime() - started.getTime() < 3 * 86400_000 ? latest : undefined;
}

/** One-line status for the Home rehab card. */
export function rehabStatus(s: RehabState): string {
  if (s.done) return 'All phases done — back to normal training, with a small Nordic dose.';
  if (s.dropBack) return `Pain went up last time — back to phase ${s.phase - 1} for now.`;
  if (s.ready) return `Ready for phase ${s.phase + 1}: ${STREAK} good sessions in a row.`;
  return `${s.streak} of ${STREAK} good sessions (pain ≤ ${GOOD_MAX}/10, not worse next morning).`;
}
