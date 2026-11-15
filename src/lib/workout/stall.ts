/** The fixes for a stalled exercise: drop the weight and build back up, or change the sets × reps. Swapping is a plain replace. */

import type { Exercise, Lookup, Routine, SetEntry, Workout, WorkoutItem } from '../../types';
import { epley } from '../progress';
import { mapItem } from './core';
import { goUpStep, pickFields, withFreshWarmups } from './plan';

const round2 = (x: number) => Math.round(x * 100) / 100;
const down = (x: number, step: number) => round2(Math.floor(x / step + 1e-9) * step);
const up = (x: number, step: number) => round2(Math.ceil(x / step - 1e-9) * step);
const isAssisted = (ex: Exercise) => /assist/i.test(ex.weightNote ?? '');
const top = (sets: SetEntry[], f: (s: SetEntry) => number | undefined) => Math.max(0, ...sets.map((s) => f(s) ?? 0));

/**
 * The sets after a reset: about 10% lighter (10% more help on assisted machines, 20% shorter holds, 20% fewer reps
 * with no added weight), at the target reps. Go-up then builds it back from there.
 */
export function resetSets(ex: Exercise, item: WorkoutItem): SetEntry[] {
  const reps = item.stall?.target ?? top(item.sets, (s) => s.reps);
  const kg = top(item.sets, (s) => s.weight);
  let set: SetEntry;
  if (ex.type === 'timed') set = { seconds: Math.max(5, down(top(item.sets, (s) => s.seconds) * 0.8, 5)), weight: kg, done: false };
  else if (ex.type === 'bodyweight')
    set = kg > 0 ? { weight: down(kg * 0.9, 2.5), reps, done: false } : { reps: Math.max(1, Math.round(reps * 0.8)), done: false };
  else if (isAssisted(ex)) set = { weight: Math.max(kg + 5, up(kg * 1.1, 5)), reps, done: false };
  else {
    const step = Math.abs(goUpStep(ex));
    set = { weight: Math.max(0, Math.min(kg - step, down(kg * 0.9, step))), reps, done: false };
  }
  return item.sets.map((s) => (s.done ? s : pickFields(ex, set)));
}

export interface RepScheme {
  sets: number;
  reps: number;
  weight: number;
}

const SCHEMES: [number, number][] = [
  [4, 5],
  [3, 8],
  [3, 12],
];

/**
 * Two other sets × reps to try, at the weight that matches today's estimated max. Only for plain weight and machine
 * lifts; the one closest to the current reps is left out.
 */
export function repSchemes(ex: Exercise, item: WorkoutItem): RepScheme[] {
  if ((ex.type !== 'weight' && ex.type !== 'machine') || isAssisted(ex)) return [];
  const max = Math.max(0, ...item.sets.map((s) => epley(s.weight ?? 0, s.reps ?? 0)));
  if (!max) return [];
  const now = item.stall?.target ?? top(item.sets, (s) => s.reps);
  const step = Math.abs(goUpStep(ex));
  const closest = SCHEMES.reduce((a, b) => (Math.abs(b[1] - now) < Math.abs(a[1] - now) ? b : a));
  return SCHEMES.filter((s) => s !== closest)
    .map(([sets, reps]) => ({ sets, reps, weight: down(max / (1 + reps / 30), step) }))
    .filter((s) => s.weight > 0);
}

/** Without the stall tag, marked with the fix (stall detection counts from this session). */
function fixed(i: WorkoutItem, fix: 'reset' | 'reps', sets: SetEntry[], lookup: Lookup): WorkoutItem {
  const { stall: _s, goUp: _g, ...rest } = i;
  return withFreshWarmups({ ...rest, sets, stallFix: fix }, lookup);
}

export function resetStalled(w: Workout, itemId: string, lookup: Lookup): Workout {
  return mapItem(w, itemId, (i) => {
    const ex = lookup(i.exerciseId);
    return ex ? fixed(i, 'reset', resetSets(ex, i), lookup) : i;
  });
}

export function changeReps(w: Workout, itemId: string, scheme: RepScheme, lookup: Lookup): Workout {
  return mapItem(w, itemId, (i) => {
    const ex = lookup(i.exerciseId);
    if (!ex) return i;
    const set = pickFields(ex, { weight: scheme.weight, reps: scheme.reps, done: false });
    return fixed(
      i,
      'reps',
      Array.from({ length: scheme.sets }, () => ({ ...set })),
      lookup,
    );
  });
}

/** Hide the tag for this session. */
export function dismissStall(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => {
    const { stall: _s, ...rest } = i;
    return rest;
  });
}

/**
 * The routine with an exercise's sets × reps changed (its first item outside the rehab dose), so the new target
 * sticks; null when the routine doesn't have it.
 */
export function routineWithScheme(r: Routine, exerciseId: string, scheme: RepScheme): Routine | null {
  const bi = r.blocks.findIndex((b) => !b.rehabDose && b.items.some((i) => i.exerciseId === exerciseId));
  if (bi < 0) return null;
  const blocks = r.blocks.map((b, n) => {
    if (n !== bi) return b;
    const k = b.items.findIndex((i) => i.exerciseId === exerciseId);
    return {
      ...b,
      items: b.items.map((i, m) =>
        m === k ? { ...i, sets: scheme.sets, reps: scheme.reps, ...(i.weight !== undefined ? { weight: scheme.weight } : {}) } : i,
      ),
    };
  });
  return { ...r, blocks };
}
