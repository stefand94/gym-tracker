import type {
  Exercise,
  Routine,
  RoutineItem,
  SetEntry,
  Workout,
  WorkoutBlock,
  WorkoutItem,
} from '../types';
import { uid } from './id';
import { lastPerformance } from './prefill';

type Lookup = (id: string) => Exercise | undefined;

/** Build the starting sets for an exercise: last time's actual sets → routine defaults → exercise defaults. */
export function buildSets(
  exercise: Exercise,
  history: Workout[],
  routineItem?: RoutineItem,
): SetEntry[] {
  const last = lastPerformance(exercise.id, history);
  if (last && last.length > 0) {
    const count = routineItem?.sets ?? last.length;
    return Array.from({ length: count }, (_, i) => {
      const src = last[Math.min(i, last.length - 1)];
      return pickFields(exercise, { ...src, done: false });
    });
  }
  const d = exercise.defaults;
  const count = routineItem?.sets ?? d.sets;
  const base: SetEntry = {
    weight: routineItem?.weight ?? d.weight,
    reps: routineItem?.reps ?? d.reps,
    seconds: routineItem?.seconds ?? d.seconds,
    done: false,
  };
  return Array.from({ length: count }, () => pickFields(exercise, base));
}

function pickFields(exercise: Exercise, s: SetEntry): SetEntry {
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
  return {
    id: uid(),
    exerciseId: exercise.id,
    status: 'pending',
    sets: buildSets(exercise, history, routineItem),
  };
}

export function workoutFromRoutine(
  routine: Routine,
  history: Workout[],
  lookup: Lookup,
  now = new Date(),
): Workout {
  const blocks: WorkoutBlock[] = [];
  for (const rb of routine.blocks) {
    const items = rb.items
      .map((ri) => {
        const ex = lookup(ri.exerciseId);
        return ex ? makeItem(ex, history, ri) : null;
      })
      .filter((x): x is WorkoutItem => x !== null);
    if (items.length) blocks.push({ id: uid(), superset: !!rb.superset && items.length > 1, items });
  }
  return { id: uid(), routineId: routine.id, name: routine.name, startedAt: now.toISOString(), blocks };
}

export function emptyWorkout(now = new Date()): Workout {
  return { id: uid(), name: 'Workout', startedAt: now.toISOString(), blocks: [] };
}

// ---------- item status ----------

export function deriveStatus(item: WorkoutItem): WorkoutItem {
  if (item.status === 'skipped') return item;
  const done = item.sets.length > 0 && item.sets.every((s) => s.done);
  const status = done ? 'done' : 'pending';
  return status === item.status ? item : { ...item, status };
}

export function blockComplete(block: WorkoutBlock): boolean {
  return block.items.every((i) => i.status !== 'pending');
}

// ---------- immutable updates ----------

function mapItem(w: Workout, itemId: string, fn: (i: WorkoutItem) => WorkoutItem): Workout {
  return {
    ...w,
    blocks: w.blocks.map((b) =>
      b.items.some((i) => i.id === itemId)
        ? { ...b, items: b.items.map((i) => (i.id === itemId ? deriveStatus(fn(i)) : i)) }
        : b,
    ),
  };
}

export function toggleSet(w: Workout, itemId: string, setIndex: number): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    status: i.status === 'skipped' ? 'pending' : i.status,
    sets: i.sets.map((s, idx) => (idx === setIndex ? { ...s, done: !s.done } : s)),
  }));
}

/** Tick every set (or untick all if every set is already done). */
export function toggleComplete(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) => {
    const allDone = i.status === 'done';
    return { ...i, status: 'pending', sets: i.sets.map((s) => ({ ...s, done: !allDone })) };
  });
}

export function toggleSkip(w: Workout, itemId: string): Workout {
  return mapItem(w, itemId, (i) =>
    i.status === 'skipped'
      ? { ...i, status: 'pending' }
      : { ...i, status: 'skipped', sets: i.sets.map((s) => ({ ...s, done: false })) },
  );
}

export type SetPatch = Partial<Pick<SetEntry, 'weight' | 'reps' | 'seconds'>>;

export function updateSet(w: Workout, itemId: string, setIndex: number, patch: SetPatch): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    sets: i.sets.map((s, idx) => (idx === setIndex ? { ...s, ...patch } : s)),
  }));
}

/** Change one set and carry the change forward to the later sets that haven't been ticked yet. */
export function updateSetForward(w: Workout, itemId: string, setIndex: number, patch: SetPatch): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    sets: i.sets.map((s, idx) => (idx === setIndex || (idx > setIndex && !s.done) ? { ...s, ...patch } : s)),
  }));
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

export function addExercise(w: Workout, exercise: Exercise, history: Workout[]): Workout {
  return { ...w, blocks: [...w.blocks, { id: uid(), superset: false, items: [makeItem(exercise, history)] }] };
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

export function moveBlock(w: Workout, blockId: string, dir: -1 | 1): Workout {
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= w.blocks.length) return w;
  const blocks = [...w.blocks];
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  return { ...w, blocks };
}

/** Merge a block with the one below it into a superset. */
export function supersetWithNext(w: Workout, blockId: string): Workout {
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0 || idx >= w.blocks.length - 1) return w;
  const a = w.blocks[idx];
  const b = w.blocks[idx + 1];
  const merged: WorkoutBlock = { id: a.id, superset: true, items: [...a.items, ...b.items] };
  const blocks = [...w.blocks];
  blocks.splice(idx, 2, merged);
  return { ...w, blocks };
}

/** Break a superset into individual blocks. */
export function splitBlock(w: Workout, blockId: string): Workout {
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return w;
  const parts: WorkoutBlock[] = w.blocks[idx].items.map((item, n) => ({
    id: n === 0 ? w.blocks[idx].id : uid(),
    superset: false,
    items: [item],
  }));
  const blocks = [...w.blocks];
  blocks.splice(idx, 1, ...parts);
  return { ...w, blocks };
}

/** Index of the first block with an exercise still to do, or -1 when everything is done or skipped. */
export function currentBlockIndex(w: Workout): number {
  return w.blocks.findIndex((b) => !blockComplete(b));
}

/** True when every non-skipped exercise in the block that has a set at this round has ticked it. */
export function roundComplete(block: WorkoutBlock, round: number): boolean {
  return block.items
    .filter((i) => i.status !== 'skipped' && round < i.sets.length)
    .every((i) => i.sets[round].done);
}

/** Add one set to every non-skipped exercise in a block (a new superset round). */
export function addRound(w: Workout, blockId: string): Workout {
  const block = w.blocks.find((b) => b.id === blockId);
  if (!block) return w;
  return block.items.filter((i) => i.status !== 'skipped').reduce((acc, i) => addSet(acc, i.id), w);
}

export function workoutProgress(w: Workout): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const b of w.blocks)
    for (const i of b.items) {
      if (i.status === 'skipped') continue;
      total += i.sets.length;
      done += i.sets.filter((s) => s.done).length;
    }
  return { done, total };
}
