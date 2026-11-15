/** Edits to the exercises in a workout: adding, replacing, removing, skipping, pain and stations. */

import type { Exercise, Lookup, Workout } from '../../types';
import { uid } from '../id';
import { cleanStation, lastPerformance } from '../prefill';
import { deriveStatus, mapItem } from './core';
import { makeItem, pickFields, withFreshWarmups } from './plan';

export function addExercise(w: Workout, exercise: Exercise, history: Workout[]): Workout {
  return { ...w, blocks: [...w.blocks, { id: uid(), superset: false, items: [makeItem(exercise, history)] }] };
}

/**
 * Swap an exercise for another. Sets already ticked stay logged: the old exercise keeps just those and the new
 * one takes the sets still to do, placed right after it. With nothing ticked, the new exercise takes its place.
 */
export function replaceItem(w: Workout, itemId: string, exercise: Exercise, history: Workout[]): Workout {
  const bi = w.blocks.findIndex((b) => b.items.some((i) => i.id === itemId));
  if (bi < 0) return w;
  const block = w.blocks[bi];
  const old = block.items.find((i) => i.id === itemId)!;
  const ticked = old.status === 'skipped' ? 0 : old.sets.filter((s) => s.done).length;
  const remaining = Math.max(1, old.sets.length - ticked);
  const fresh = makeItem(exercise, history, { exerciseId: exercise.id, sets: remaining });
  const blocks = [...w.blocks];
  if (ticked === 0) {
    blocks[bi] = { ...block, items: block.items.map((i) => (i.id === itemId ? fresh : i)) };
  } else {
    const kept = deriveStatus({ ...old, sets: old.sets.filter((s) => s.done) });
    if (block.superset) {
      const items = block.items.flatMap((i) => (i.id === itemId ? [kept, fresh] : [i]));
      blocks[bi] = { ...block, items };
    } else {
      blocks.splice(bi, 1, { ...block, items: [kept] }, { id: uid(), superset: false, items: [fresh] });
    }
  }
  return { ...w, blocks };
}

export function removeItem(w: Workout, itemId: string): Workout {
  return {
    ...w,
    blocks: w.blocks
      .map((b) => {
        const items = b.items.filter((i) => i.id !== itemId);
        return { ...b, items, superset: b.superset && items.length > 1 };
      })
      .filter((b) => b.items.length > 0),
  };
}

export function toggleSkip(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) =>
    i.status === 'skipped' ? { ...i, status: 'pending' } : { ...i, status: 'skipped', sets: i.sets.map((s) => ({ ...s, done: false })) },
  );
}

/** Set (or clear, with undefined) the 0–10 pain score on an item; logging pain also marks it as tracked. */
export function setPain(w: Workout, itemId: string, pain: number | undefined): Workout {
  return mapItem(w, itemId, (i) => {
    const { pain: _old, ...rest } = i;
    return pain === undefined ? rest : { ...rest, trackPain: true, pain };
  });
}

export function toggleTrackPain(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => {
    if (!i.trackPain) return { ...i, trackPain: true };
    const { trackPain: _t, pain: _p, ...rest } = i;
    return rest;
  });
}

/**
 * Set (or clear) the station an item is done on. Unticked sets re-fill from the last time on that station,
 * when there is one; otherwise they're left as they are.
 */
export function setStation(w: Workout, itemId: string, station: string | undefined, history: Workout[], lookup: Lookup): Workout {
  return mapItem(w, itemId, (i) => {
    const { station: _old, ...rest } = i;
    const name = station ? cleanStation(station) : '';
    if (!name) return rest;
    const ex = lookup(i.exerciseId);
    const last = ex ? lastPerformance(i.exerciseId, history, name, true) : null;
    const sets =
      ex && last ? i.sets.map((s, idx) => (s.done ? s : pickFields(ex, { ...last[Math.min(idx, last.length - 1)], done: false }))) : i.sets;
    if (!last) return { ...rest, station: name, sets };
    const { goUp: _g, stall: _s, ...plain } = rest; // worked out for the old station
    return withFreshWarmups({ ...plain, station: name, sets }, lookup);
  });
}
