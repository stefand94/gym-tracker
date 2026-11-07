import type { Exercise, ExerciseType, SetEntry, Workout } from '../types';

export interface Metric {
  key: string;
  label: string;
  unit: string;
  compute: (sets: SetEntry[]) => number | null;
}

export function epley(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
const sum = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) : null);
const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

const WEIGHT_METRICS: Metric[] = [
  { key: 'top', label: 'Top weight', unit: 'kg', compute: (s) => max(s.map((x) => x.weight ?? 0)) },
  {
    key: 'e1rm',
    label: 'Est. 1RM',
    unit: 'kg',
    compute: (s) => round1(max(s.map((x) => epley(x.weight ?? 0, x.reps ?? 0)))),
  },
  { key: 'volume', label: 'Volume', unit: 'kg', compute: (s) => sum(s.map((x) => (x.weight ?? 0) * (x.reps ?? 0))) },
];

const BODYWEIGHT_METRICS: Metric[] = [
  { key: 'top', label: 'Best reps', unit: 'reps', compute: (s) => max(s.map((x) => x.reps ?? 0)) },
  { key: 'added', label: 'Added weight', unit: 'kg', compute: (s) => max(s.map((x) => x.weight ?? 0)) },
  { key: 'volume', label: 'Total reps', unit: 'reps', compute: (s) => sum(s.map((x) => x.reps ?? 0)) },
];

const TIMED_METRICS: Metric[] = [
  { key: 'top', label: 'Longest hold', unit: 's', compute: (s) => max(s.map((x) => x.seconds ?? 0)) },
  { key: 'volume', label: 'Total time', unit: 's', compute: (s) => sum(s.map((x) => x.seconds ?? 0)) },
];

export function metricsFor(type: ExerciseType): Metric[] {
  if (type === 'bodyweight') return BODYWEIGHT_METRICS;
  if (type === 'timed') return TIMED_METRICS;
  return WEIGHT_METRICS;
}

export interface Point {
  date: string;
  value: number;
}

/** One point per finished workout that included done sets of this exercise, oldest first. */
export function series(exercise: Exercise, metric: Metric, history: Workout[]): Point[] {
  const pts: Point[] = [];
  const sorted = history.filter((w) => w.finishedAt).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  for (const w of sorted) {
    const sets: SetEntry[] = [];
    for (const b of w.blocks)
      for (const i of b.items)
        if (i.exerciseId === exercise.id && i.status !== 'skipped') sets.push(...i.sets.filter((s) => s.done));
    if (!sets.length) continue;
    const v = metric.compute(sets);
    if (v !== null) pts.push({ date: w.startedAt, value: v });
  }
  return pts;
}

/** Exercise ids that appear (with done sets) in history, most recently used first. */
export function performedExerciseIds(history: Workout[]): string[] {
  const latest = new Map<string, string>();
  for (const w of history) {
    if (!w.finishedAt) continue;
    for (const b of w.blocks)
      for (const i of b.items)
        if (i.status !== 'skipped' && i.sets.some((s) => s.done)) {
          const prev = latest.get(i.exerciseId);
          if (!prev || prev < w.startedAt) latest.set(i.exerciseId, w.startedAt);
        }
  }
  return [...latest.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([id]) => id);
}
