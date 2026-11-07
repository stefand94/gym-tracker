import type { SetEntry, Workout } from '../types';

/** Finished workouts, newest first. */
export function finishedNewestFirst(history: Workout[]): Workout[] {
  return history
    .filter((w) => w.finishedAt)
    .sort((a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0));
}

/** The done sets from the most recent finished workout that included this exercise. */
export function lastPerformance(exerciseId: string, history: Workout[]): SetEntry[] | null {
  for (const w of finishedNewestFirst(history)) {
    for (const b of w.blocks)
      for (const i of b.items) {
        if (i.exerciseId !== exerciseId || i.status === 'skipped') continue;
        const done = i.sets.filter((s) => s.done);
        if (done.length) return done;
      }
  }
  return null;
}
