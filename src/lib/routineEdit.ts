import type { Exercise, Routine, RoutineBlock, RoutineItem, Workout, WorkoutItem } from '../types';
import { lastPerformance, lastStation } from './prefill';

type Lookup = (id: string) => Exercise | undefined;

/** A url- and file-safe id from a name that no other routine (or bundled seed) uses. */
export function newRoutineId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workout';
  let id = slug;
  for (let n = 2; used.has(id); n++) id = `${slug}-${n}`;
  return id;
}

/** A routine item from what was done: set count, the first set's reps (or seconds), station, pain tracking. */
function itemFromWorkout(i: WorkoutItem, lookup: Lookup): RoutineItem {
  const ex = lookup(i.exerciseId);
  const first = i.sets[0];
  const out: RoutineItem = { exerciseId: i.exerciseId, sets: i.sets.length };
  if (ex?.type === 'timed') {
    if (first?.seconds !== undefined) out.seconds = first.seconds;
  } else if (first?.reps !== undefined) out.reps = first.reps;
  if (i.station) out.station = i.station;
  if (i.trackPain) out.trackPain = true;
  return out;
}

/** "Save as routine": the workout's exercises in its order and supersets; skipped ones are left out. */
export function routineFromWorkout(w: Workout, lookup: Lookup): Omit<Routine, 'id'> {
  const blocks: RoutineBlock[] = [];
  let dose: RoutineBlock | null = null;
  for (const b of w.blocks) {
    const items = b.items.filter((i) => i.status !== 'skipped').map((i) => itemFromWorkout(i, lookup));
    if (!items.length) continue;
    if (b.rehabDose) {
      // the dose blocks become one dose block again (so it keeps following the rehab phase)
      if (dose) dose.items.push(...items);
      else blocks.push((dose = { rehabDose: b.rehabDose, items }));
    } else blocks.push(b.superset && items.length > 1 ? { superset: true, items } : { items });
  }
  return { name: w.name, blocks };
}

/** How many sets the workout started with for a routine item (explicit sets, else last time's, else defaults). */
function plannedSets(ri: RoutineItem, w: Workout, history: Workout[], lookup: Lookup): number {
  if (ri.sets) return ri.sets;
  const prior = history.filter((h) => h.id !== w.id && h.startedAt < w.startedAt);
  const station = ri.station ?? lastStation(ri.exerciseId, prior);
  return lastPerformance(ri.exerciseId, prior, station)?.length || lookup(ri.exerciseId)?.defaults.sets || 3;
}

/**
 * The routine with today's structure: exercise order, supersets and set counts. Exercises it already had keep their
 * reps, weight and station (weights pre-fill from last time anyway); the rehab dose block stays a dose block.
 */
export function routineWithWorkout(routine: Routine, w: Workout, history: Workout[], lookup: Lookup): Routine {
  const pool = routine.blocks.filter((b) => !b.rehabDose).flatMap((b) => b.items);
  const take = (exerciseId: string) => {
    const at = pool.findIndex((p) => p.exerciseId === exerciseId);
    return at < 0 ? undefined : pool.splice(at, 1)[0];
  };
  const dose = routine.blocks.find((b) => b.rehabDose);
  let doseDone = false;
  const blocks: RoutineBlock[] = [];
  for (const b of w.blocks) {
    if (b.rehabDose) {
      if (dose && !doseDone) blocks.push(dose);
      doseDone = true;
      continue;
    }
    const items = b.items.map((i) => {
      const prev = take(i.exerciseId);
      if (!prev) return itemFromWorkout(i, lookup);
      return i.sets.length === plannedSets(prev, w, history, lookup) ? prev : { ...prev, sets: i.sets.length };
    });
    if (items.length) blocks.push(b.superset && items.length > 1 ? { superset: true, items } : { items });
  }
  // the rehab dose matters too much to drop by accident
  if (dose && !doseDone) blocks.push(dose);
  return { ...routine, blocks };
}

/** Blocks as a workout lays them out: a plain block with several exercises is one block each. */
function layout(blocks: RoutineBlock[]) {
  return blocks.flatMap((b) => {
    if (b.rehabDose) return [{ dose: b.rehabDose, items: b.items }];
    if (b.superset && b.items.length > 1) return [{ superset: true, items: b.items }];
    return b.items.map((i) => ({ items: [i] }));
  });
}

export function sameRoutineLayout(a: Routine, b: Routine): boolean {
  return JSON.stringify(layout(a.blocks)) === JSON.stringify(layout(b.blocks));
}

/** One line on what an update would change, e.g. "Adds Cable fly · drops Plank" or "New order and set counts". */
export function describeChanges(before: Routine, after: Routine, lookup: Lookup): string {
  const ids = (r: Routine) => r.blocks.filter((b) => !b.rehabDose).flatMap((b) => b.items.map((i) => i.exerciseId));
  const was = ids(before);
  const now = ids(after);
  const name = (id: string) => lookup(id)?.name ?? id;
  const added = now.filter((id) => !was.includes(id)).map(name);
  const dropped = was.filter((id) => !now.includes(id)).map(name);
  const parts: string[] = [];
  if (added.length) parts.push(`adds ${added.join(', ')}`);
  if (dropped.length) parts.push(`drops ${dropped.join(', ')}`);
  if (!parts.length) parts.push('new order, supersets or set counts');
  const s = parts.join(' · ');
  return s[0].toUpperCase() + s.slice(1);
}
