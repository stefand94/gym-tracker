import { MUSCLE_IDS, type MuscleId } from '../data/muscles';
import type { Exercise, Workout, WorkoutItem } from '../types';

export type MuscleLoad = Record<MuscleId, number>;
type Lookup = (id: string) => Exercise | undefined;

export const PRIMARY_CREDIT = 1;
export const SECONDARY_CREDIT = 0.5;

export function emptyLoad(): MuscleLoad {
  return Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as MuscleLoad;
}

/** Load for an exercise definition (used for the per-exercise map): primary = 1, secondary = 0.5. */
export function exerciseMap(ex: Exercise): MuscleLoad {
  const load = emptyLoad();
  for (const m of ex.secondary) load[m] = SECONDARY_CREDIT;
  for (const m of ex.primary) load[m] = PRIMARY_CREDIT;
  return load;
}

export function addItemLoad(load: MuscleLoad, item: WorkoutItem, lookup: Lookup): void {
  if (item.status === 'skipped') return;
  const ex = lookup(item.exerciseId);
  if (!ex) return;
  const sets = item.sets.filter((s) => s.done).length;
  if (!sets) return;
  for (const m of ex.primary) load[m] += sets * PRIMARY_CREDIT;
  for (const m of ex.secondary) load[m] += sets * SECONDARY_CREDIT;
}

export function workoutLoad(w: Workout, lookup: Lookup): MuscleLoad {
  const load = emptyLoad();
  for (const b of w.blocks) for (const i of b.items) addItemLoad(load, i, lookup);
  return load;
}

/** Weighted sets per muscle across finished workouts started in the last `days` days. */
export function loadSince(history: Workout[], days: number, lookup: Lookup, now = new Date()): MuscleLoad {
  const cutoff = now.getTime() - days * 86400000;
  const load = emptyLoad();
  for (const w of history) {
    if (!w.finishedAt || new Date(w.startedAt).getTime() < cutoff) continue;
    for (const b of w.blocks) for (const i of b.items) addItemLoad(load, i, lookup);
  }
  return load;
}

/** Most recent date each muscle got at least one done set (primary or secondary). */
export function lastTrained(history: Workout[], lookup: Lookup): Partial<Record<MuscleId, string>> {
  const out: Partial<Record<MuscleId, string>> = {};
  for (const w of history) {
    if (!w.finishedAt) continue;
    const load = workoutLoad(w, lookup);
    for (const m of MUSCLE_IDS) {
      if (load[m] > 0 && (!out[m] || out[m]! < w.startedAt)) out[m] = w.startedAt;
    }
  }
  return out;
}

export function maxLoad(load: MuscleLoad): number {
  return Math.max(0, ...Object.values(load));
}
