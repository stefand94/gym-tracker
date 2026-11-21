/** Edits to an exercise's sets and warm-ups during a workout. */

import type { Lookup, SetEntry, Workout } from '../../types';
import { lastPerformance } from '../prefill';
import { mapItem } from './core';
import { fromLast, warmupSets, withFreshWarmups } from './plan';

export type SetPatch = Partial<Pick<SetEntry, 'weight' | 'reps' | 'seconds' | 'secondsR'>>;

export function toggleSet(w: Workout, itemId: string, setIndex: number): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    status: i.status === 'skipped' ? 'pending' : i.status,
    sets: i.sets.map((s, idx) => (idx === setIndex ? { ...s, done: !s.done } : s)),
  }));
}

/**
 * Log a timed set as held for `seconds` and tick it (only that set changes). On a two-sided hold the left side
 * only logs its seconds (the right is still to come); the right side logs its own and ticks the set.
 */
export function completeHold(w: Workout, itemId: string, setIndex: number, seconds: number, side?: 'L' | 'R'): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    status: i.status === 'skipped' ? 'pending' : i.status,
    sets: i.sets.map((s, idx) =>
      idx !== setIndex
        ? s
        : side === 'L'
          ? { ...s, seconds }
          : side === 'R'
            ? { ...s, secondsR: seconds, done: true }
            : { ...s, seconds, done: true },
    ),
  }));
}

/** Tick every set (or untick all if every set is already done). */
export function toggleComplete(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => {
    const allDone = i.status === 'done';
    return { ...i, status: 'pending', sets: i.sets.map((s) => ({ ...s, done: !allDone })) };
  });
}

export function updateSet(w: Workout, itemId: string, setIndex: number, patch: SetPatch): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    sets: i.sets.map((s, idx) => (idx === setIndex ? { ...s, ...patch } : s)),
  }));
}

/** Change one set and carry the change forward to the later sets that haven't been ticked yet. */
export function updateSetForward(w: Workout, itemId: string, setIndex: number, patch: SetPatch, lookup?: Lookup): Workout {
  return mapItem(w, itemId, (i) =>
    withFreshWarmups(
      {
        ...i,
        sets: i.sets.map((s, idx) => (idx === setIndex || (idx > setIndex && !s.done) ? { ...s, ...patch } : s)),
      },
      patch.weight !== undefined ? lookup : undefined,
    ),
  );
}

/** Apply a value to every set that hasn't been ticked yet. */
export function updateUnticked(w: Workout, itemId: string, patch: SetPatch): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    sets: i.sets.map((s) => (s.done ? s : { ...s, ...patch })),
  }));
}

export function addSet(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => {
    const last = i.sets[i.sets.length - 1];
    const next: SetEntry = last ? { ...last, done: false } : { reps: 10, weight: 0, done: false };
    return { ...i, status: i.status === 'skipped' ? 'skipped' : 'pending', sets: [...i.sets, next] };
  });
}

export function removeSet(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => (i.sets.length > 1 ? { ...i, sets: i.sets.slice(0, -1) } : i));
}

/** Add one set to every non-skipped exercise in a block (a new superset round). */
export function addRound(w: Workout, blockId: string): Workout {
  const block = w.blocks.find((b) => b.id === blockId);
  if (!block) return w;
  return block.items.filter((i) => i.status !== 'skipped').reduce((acc, i) => addSet(acc, i.id), w);
}

export function toggleWarmup(w: Workout, itemId: string, k: number): Workout {
  return mapItem(w, itemId, (i) => ({ ...i, warmups: i.warmups?.map((s, n) => (n === k ? { ...s, done: !s.done } : s)) }));
}

export function updateWarmup(w: Workout, itemId: string, k: number, patch: SetPatch): Workout {
  return mapItem(w, itemId, (i) => ({ ...i, warmups: i.warmups?.map((s, n) => (n === k ? { ...s, ...patch } : s)) }));
}

/** Add warm-ups worked out from the working weight, or take them away. */
export function toggleWarmups(w: Workout, itemId: string, lookup: Lookup): Workout {
  return mapItem(w, itemId, (i) => {
    const { warmups: had, ...rest } = i;
    if (had?.length) return rest;
    const ex = lookup(i.exerciseId);
    const warmups = ex ? warmupSets(ex, i.sets, true) : [];
    return warmups.length ? { ...rest, warmups } : rest;
  });
}

/** Undo a go-up: the sets still to do go back to last time's (on the same station, when it has one). */
export function keepLastWeight(w: Workout, itemId: string, history: Workout[], lookup: Lookup): Workout {
  return mapItem(w, itemId, (i) => {
    const { goUp: _g, ...rest } = i;
    const ex = lookup(i.exerciseId);
    const last = ex && lastPerformance(i.exerciseId, history, i.station);
    if (!ex || !last?.length) return rest;
    const fresh = fromLast(ex, last, i.sets.length);
    return withFreshWarmups({ ...rest, sets: i.sets.map((s, n) => (s.done ? s : fresh[n])) }, lookup);
  });
}
