/** What an exercise starts a workout with: sets pre-filled from last time, go-up nudges and warm-ups. */

import type {
  Exercise,
  Lookup,
  Routine,
  RoutineBlock,
  RoutineItem,
  SetEntry,
  Stall,
  Workout,
  WorkoutBlock,
  WorkoutItem,
} from '../../types';
import { uid } from '../id';
import { lastPerformance, lastStation } from '../prefill';
import { stallFrom } from '../stall';

const round2 = (x: number) => Math.round(x * 100) / 100;

/** One step up: a dumbbell or kettlebell size, 5 kg on machines, 2.5 kg on bars and cables; assisted machines take 5 kg of help off. */
export function goUpStep(ex: Exercise): number {
  if (/assist/i.test(ex.weightNote ?? '')) return -5;
  if (ex.type === 'machine') return 5;
  if (/dumbbell/i.test(ex.equipment)) return 2;
  if (/kettlebell/i.test(ex.equipment)) return 4;
  return 2.5;
}

/**
 * Whether last time earns a step up: a weight or machine exercise where every planned set was done at one
 * weight, each at or above the target reps. Returns the change in kg, or 0 to stay where you were.
 */
export function goUpFrom(ex: Exercise, last: SetEntry[], target: number | undefined, planned: number): number {
  if ((ex.type !== 'weight' && ex.type !== 'machine') || !target || !last.length || last.length < planned) return 0;
  const w = last[0].weight ?? 0;
  if (w <= 0 || last.some((s) => (s.weight ?? 0) !== w || (s.reps ?? 0) < target)) return 0;
  const step = goUpStep(ex);
  return w + step < 0 ? -w : step;
}

/**
 * The starting sets for an exercise: last time's actual sets (one step heavier when every set hit the target
 * reps) → routine values → exercise defaults. Without a step up, it checks whether the exercise has stalled.
 */
export function planSets(
  exercise: Exercise,
  history: Workout[],
  routineItem?: RoutineItem,
  station?: string,
): { sets: SetEntry[]; goUp?: number; stall?: Stall } {
  const last = lastPerformance(exercise.id, history, station);
  if (last && last.length > 0) {
    const count = routineItem?.sets ?? last.length;
    const target = routineItem?.reps ?? exercise.defaults.reps;
    const step = routineItem?.trackPain ? 0 : goUpFrom(exercise, last, target, count);
    if (step) {
      const set = pickFields(exercise, { weight: round2((last[0].weight ?? 0) + step), reps: target, done: false });
      return { sets: Array.from({ length: count }, () => ({ ...set })), goUp: step };
    }
    const stall = routineItem?.trackPain ? null : stallFrom(exercise, history, station, target);
    return { sets: fromLast(exercise, last, count), ...(stall ? { stall } : {}) };
  }
  const d = exercise.defaults;
  const count = routineItem?.sets ?? d.sets;
  const base: SetEntry = {
    weight: routineItem?.weight ?? d.weight,
    reps: routineItem?.reps ?? d.reps,
    seconds: routineItem?.seconds ?? d.seconds,
    done: false,
  };
  return { sets: Array.from({ length: count }, () => pickFields(exercise, base)) };
}

export const fromLast = (exercise: Exercise, last: SetEntry[], count: number) =>
  Array.from({ length: count }, (_, i) => pickFields(exercise, { ...last[Math.min(i, last.length - 1)], done: false }));

const BAR = 20;

/**
 * Ramp-up sets before the working sets: for a heavy barbell lift the empty bar, then about 50% and 75% of the
 * working weight, skipping any too close to the one before. `force` makes them for any weight or machine exercise.
 */
export function warmupSets(ex: Exercise, sets: SetEntry[], force = false): SetEntry[] {
  if ((!ex.warmup && !force) || (ex.type !== 'weight' && ex.type !== 'machine') || /assist/i.test(ex.weightNote ?? '')) return [];
  const top = Math.max(0, ...sets.map((s) => s.weight ?? 0));
  if (top < (force ? 5 : 40)) return [];
  const bar = /barbell/i.test(ex.equipment);
  const unit = bar ? 2.5 : Math.abs(goUpStep(ex));
  const gap = bar ? 10 : unit;
  const out: SetEntry[] = bar && top > BAR ? [{ weight: BAR, reps: 10, done: false }] : [];
  for (const [pct, reps] of [
    [0.5, 8],
    [0.75, 5],
  ]) {
    const weight = round2(Math.round((top * pct) / unit) * unit);
    if (weight > 0 && weight < top && weight - (out.at(-1)?.weight ?? 0) >= gap) out.push({ weight, reps, done: false });
  }
  return out;
}

/** Warm-ups follow the working weight until one of them is ticked. */
export function withFreshWarmups(i: WorkoutItem, lookup?: Lookup): WorkoutItem {
  const ex = lookup?.(i.exerciseId);
  if (!ex || !i.warmups?.length || i.warmups.some((s) => s.done)) return i;
  const warmups = warmupSets(ex, i.sets, true);
  if (warmups.length) return { ...i, warmups };
  const { warmups: _w, ...rest } = i;
  return rest;
}

export function pickFields(exercise: Exercise, s: SetEntry): SetEntry {
  const out: SetEntry = { done: s.done };
  if (exercise.type === 'timed') {
    out.seconds = s.seconds ?? exercise.defaults.seconds ?? 30;
    if (s.weight) out.weight = s.weight;
  } else {
    out.reps = s.reps ?? exercise.defaults.reps ?? 10;
    if (exercise.type === 'bodyweight') {
      if (s.weight) out.weight = s.weight;
    } else {
      out.weight = s.weight ?? exercise.defaults.weight ?? 0;
    }
  }
  return out;
}

export function makeItem(exercise: Exercise, history: Workout[], routineItem?: RoutineItem): WorkoutItem {
  const station = routineItem?.station ?? lastStation(exercise.id, history);
  const { sets, goUp, stall } = planSets(exercise, history, routineItem, station);
  const warmups = warmupSets(exercise, sets);
  return {
    id: uid(),
    exerciseId: exercise.id,
    status: 'pending',
    sets,
    ...(warmups.length ? { warmups } : {}),
    ...(goUp ? { goUp } : {}),
    ...(stall ? { stall } : {}),
    ...(routineItem?.trackPain ? { trackPain: true } : {}),
    ...(station ? { station } : {}),
  };
}

export function workoutFromRoutine(
  routine: Routine,
  history: Workout[],
  lookup: Lookup,
  now = new Date(),
  /** Fills in `rehabDose` blocks (see rehab.ts doseItems). */
  dose?: (block: RoutineBlock) => RoutineItem[],
): Workout {
  const blocks: WorkoutBlock[] = [];
  for (const rb of routine.blocks) {
    const items = (rb.rehabDose && dose ? dose(rb) : rb.items)
      .map((ri) => {
        const ex = lookup(ri.exerciseId);
        return ex ? makeItem(ex, history, ri) : null;
      })
      .filter((x): x is WorkoutItem => x !== null);
    const mark = rb.rehabDose ? { rehabDose: rb.rehabDose } : {};
    if (rb.superset && items.length > 1) blocks.push({ id: uid(), superset: true, items, ...mark });
    // a plain block with several exercises means "one after the other": one block each
    else for (const item of items) blocks.push({ id: uid(), superset: false, items: [item], ...mark });
  }
  return { id: uid(), routineId: routine.id, name: routine.name, startedAt: now.toISOString(), blocks };
}

export function emptyWorkout(now = new Date()): Workout {
  return { id: uid(), name: 'Workout', startedAt: now.toISOString(), blocks: [] };
}
