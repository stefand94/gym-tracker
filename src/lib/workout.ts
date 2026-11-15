import type { Exercise, Routine, RoutineBlock, RoutineItem, SetEntry, Workout, WorkoutBlock, WorkoutItem } from '../types';
import { uid } from './id';
import { cleanStation, lastPerformance, lastStation } from './prefill';

type Lookup = (id: string) => Exercise | undefined;

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
 * reps) → routine values → exercise defaults.
 */
export function planSets(
  exercise: Exercise,
  history: Workout[],
  routineItem?: RoutineItem,
  station?: string,
): { sets: SetEntry[]; goUp?: number } {
  const last = lastPerformance(exercise.id, history, station);
  if (last && last.length > 0) {
    const count = routineItem?.sets ?? last.length;
    const target = routineItem?.reps ?? exercise.defaults.reps;
    const step = routineItem?.trackPain ? 0 : goUpFrom(exercise, last, target, count);
    if (step) {
      const set = pickFields(exercise, { weight: round2((last[0].weight ?? 0) + step), reps: target, done: false });
      return { sets: Array.from({ length: count }, () => ({ ...set })), goUp: step };
    }
    return { sets: fromLast(exercise, last, count) };
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

export const buildSets = (exercise: Exercise, history: Workout[], routineItem?: RoutineItem, station?: string): SetEntry[] =>
  planSets(exercise, history, routineItem, station).sets;

const fromLast = (exercise: Exercise, last: SetEntry[], count: number) =>
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
  const station = routineItem?.station ?? lastStation(exercise.id, history);
  const { sets, goUp } = planSets(exercise, history, routineItem, station);
  const warmups = warmupSets(exercise, sets);
  return {
    id: uid(),
    exerciseId: exercise.id,
    status: 'pending',
    sets,
    ...(warmups.length ? { warmups } : {}),
    ...(goUp ? { goUp } : {}),
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
      b.items.some((i) => i.id === itemId) ? { ...b, items: b.items.map((i) => (i.id === itemId ? deriveStatus(fn(i)) : i)) } : b,
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

/** Log a timed set as held for `seconds` and tick it (only that set changes). */
export function completeHold(w: Workout, itemId: string, setIndex: number, seconds: number): Workout {
  return mapItem(w, itemId, (i) => ({
    ...i,
    status: i.status === 'skipped' ? 'pending' : i.status,
    sets: i.sets.map((s, idx) => (idx === setIndex ? { ...s, seconds, done: true } : s)),
  }));
}

/** Whether ticking this set should start a rest: always in a single block, only at the end of a round in a superset. */
export function restsAfter(w: Workout, itemId: string, setIndex: number): boolean {
  const block = w.blocks.find((b) => b.items.some((i) => i.id === itemId));
  if (!block || !block.superset) return true;
  return roundComplete(block, setIndex);
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
    i.status === 'skipped' ? { ...i, status: 'pending' } : { ...i, status: 'skipped', sets: i.sets.map((s) => ({ ...s, done: false })) },
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

/** Warm-ups follow the working weight until one of them is ticked. */
function withFreshWarmups(i: WorkoutItem, lookup?: Lookup): WorkoutItem {
  const ex = lookup?.(i.exerciseId);
  if (!ex || !i.warmups?.length || i.warmups.some((s) => s.done)) return i;
  const warmups = warmupSets(ex, i.sets, true);
  if (warmups.length) return { ...i, warmups };
  const { warmups: _w, ...rest } = i;
  return rest;
}

// ---------- warm-ups ----------

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

// ---------- interval timers ----------

/**
 * After an interval's timer ends: the next set in round order in the same superset, when it's an unticked
 * interval too (walk → jog → walk …), so its timer can start straight away.
 */
export function nextInterval(
  w: Workout,
  itemId: string,
  set: number,
  lookup: Lookup,
): { itemId: string; set: number; seconds: number } | null {
  const block = w.blocks.find((b) => b.items.some((i) => i.id === itemId));
  if (!block?.superset || !lookup(block.items.find((i) => i.id === itemId)!.exerciseId)?.intervals) return null;
  const order = block.items.filter((i) => i.status !== 'skipped');
  const rounds = Math.max(0, ...order.map((i) => i.sets.length));
  const seq = Array.from({ length: rounds }, (_, r) => order.filter((i) => r < i.sets.length).map((i) => ({ i, r }))).flat();
  const at = seq.findIndex((x) => x.i.id === itemId && x.r === set);
  const next = at >= 0 ? seq[at + 1] : undefined;
  if (!next) return null;
  const s = next.i.sets[next.r];
  if (s.done || !s.seconds || !lookup(next.i.exerciseId)?.intervals) return null;
  return { itemId: next.i.id, set: next.r, seconds: s.seconds };
}

type Hold = { itemId: string; set: number; goAt: number; endsAt: number };

/**
 * A hold that has run out: tick it, and with walk/jog intervals each one after it, timed from the moment the one
 * before ended — so the ones that ran out while the phone was locked are ticked too. Returns the workout, the
 * interval running now (if any) and the last hold ticked.
 */
export function finishHolds(w: Workout, hold: Hold, now: number, lookup: Lookup): { workout: Workout; next: Hold | null; last: Hold } {
  let cur = hold;
  let out = w;
  for (;;) {
    out = completeHold(out, cur.itemId, cur.set, Math.round((cur.endsAt - cur.goAt) / 1000));
    const n = nextInterval(out, cur.itemId, cur.set, lookup);
    if (!n) return { workout: out, next: null, last: cur };
    const next = { itemId: n.itemId, set: n.set, goAt: cur.endsAt, endsAt: cur.endsAt + n.seconds * 1000 };
    if (next.endsAt > now) return { workout: out, next, last: cur };
    cur = next;
  }
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

export function moveBlock(w: Workout, blockId: string, dir: -1 | 1): Workout {
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= w.blocks.length) return w;
  const blocks = [...w.blocks];
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  return { ...w, blocks };
}

/** Can a block be merged with the one below it? Not across the rehab dose's edge: the dose stays apart. */
export function canSupersetWithNext(w: Workout, blockId: string): boolean {
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  return idx >= 0 && idx < w.blocks.length - 1 && w.blocks[idx].rehabDose === w.blocks[idx + 1].rehabDose;
}

/** Merge a block with the one below it into a superset. */
export function supersetWithNext(w: Workout, blockId: string): Workout {
  if (!canSupersetWithNext(w, blockId)) return w;
  const idx = w.blocks.findIndex((b) => b.id === blockId);
  const a = w.blocks[idx];
  const b = w.blocks[idx + 1];
  const merged: WorkoutBlock = { id: a.id, superset: true, ...doseMark(a), items: [...a.items, ...b.items] };
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
    ...doseMark(w.blocks[idx]),
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
  return block.items.filter((i) => i.status !== 'skipped' && round < i.sets.length).every((i) => i.sets[round].done);
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
    const { goUp: _g, ...plain } = rest;
    return withFreshWarmups({ ...plain, station: name, sets }, lookup);
  });
}

/** Where a dragged exercise lands: a new block in gap n (0 = before the first block), or into a block as a superset. */
export type DropTarget = { gap: number } | { join: string };

interface BlockLike<I extends { id: string }> {
  id: string;
  superset?: boolean;
  items: I[];
}

/**
 * Move items (one exercise, or every exercise of a block) to a gap between blocks or into another block.
 * Blocks left empty disappear; a superset left with one exercise becomes a plain block. Moving a whole block
 * keeps its id. Generic so the routine editor can use it too.
 */
export function moveItems<I extends { id: string }, B extends BlockLike<I>>(
  blocks: B[],
  ids: string[],
  target: DropTarget,
  newId: () => string = uid,
): B[] {
  const set = new Set(ids);
  const moving = blocks.flatMap((b) => b.items.filter((i) => set.has(i.id)));
  if (!moving.length) return blocks;
  const whole = blocks.find((b) => b.items.length === moving.length && b.items.every((i) => set.has(i.id)));
  const without = (b: B): B | null => {
    const items = b.items.filter((i) => !set.has(i.id));
    if (!items.length) return null;
    return items.length === b.items.length ? b : { ...b, items, superset: !!b.superset && items.length > 1 };
  };

  if ('join' in target) {
    const t = blocks.find((b) => b.id === target.join);
    if (!t || t.items.every((i) => set.has(i.id)) || moving.every((i) => t.items.includes(i))) return blocks;
    return blocks.flatMap((b) =>
      b.id === t.id ? [{ ...b, superset: true, items: [...b.items.filter((i) => !set.has(i.id)), ...moving] }] : (without(b) ?? []),
    );
  }

  const rows: (B | null)[] = [...blocks];
  rows.splice(Math.max(0, Math.min(target.gap, blocks.length)), 0, null);
  return rows.flatMap((b) => {
    if (b) return without(b) ?? [];
    return [whole ? whole : ({ id: newId(), superset: moving.length > 1, items: moving } as unknown as B)];
  });
}

const doseMark = (b: WorkoutBlock): Pick<WorkoutBlock, 'rehabDose'> => (b.rehabDose ? { rehabDose: b.rehabDose } : {});

/**
 * Drag-and-drop in a workout. The rehab dose's exercises never share a block with the rest (that's how the finish
 * screen and the planner tell them apart), so a join across that edge is refused, and dose exercises dragged to a
 * gap stay marked.
 */
export function moveInWorkout(w: Workout, ids: string[], target: DropTarget): Workout {
  const set = new Set(ids);
  const doses = new Set(w.blocks.filter((b) => b.items.some((i) => set.has(i.id))).map((b) => b.rehabDose));
  if (doses.size !== 1) return w;
  const [dose] = doses;
  if ('join' in target && w.blocks.find((b) => b.id === target.join)?.rehabDose !== dose) return w;
  const old = new Set(w.blocks.map((b) => b.id));
  const blocks = moveItems(w.blocks, ids, target);
  if (blocks === w.blocks) return w;
  return { ...w, blocks: dose ? blocks.map((b) => (old.has(b.id) ? b : { ...b, rehabDose: dose })) : blocks };
}

/** Same blocks, same exercises, same order? */
export function sameLayout(a: { id: string; items: { id: string }[] }[], b: { id: string; items: { id: string }[] }[]): boolean {
  const sig = (x: typeof a) => x.map((bl) => bl.items.map((i) => i.id).join(',')).join('|');
  return sig(a) === sig(b);
}
