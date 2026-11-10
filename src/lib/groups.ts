import type { MuscleId } from '../data/muscles';
import type { Exercise, Workout } from '../types';

export type Group = 'push' | 'pull' | 'legs' | 'core';
export const GROUPS: Group[] = ['push', 'pull', 'legs', 'core'];
export const GROUP_LABELS: Record<Group, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core' };

/** Which group each muscle belongs to. Neck belongs to none. */
const MUSCLE_GROUP: Record<MuscleId, Group | null> = {
  chest: 'push',
  frontDelts: 'push',
  sideDelts: 'push',
  triceps: 'push',
  lats: 'pull',
  upperBack: 'pull',
  rearDelts: 'pull',
  biceps: 'pull',
  forearms: 'pull',
  traps: 'pull',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  abductors: 'legs',
  adductors: 'legs',
  lowerBack: 'legs',
  abs: 'core',
  obliques: 'core',
  neck: null,
};

/** An exercise's group: the one most of its primary muscles fall in (ties go to the first listed). */
export function exerciseGroup(ex: Exercise): Group | null {
  const count = new Map<Group, number>();
  for (const m of ex.primary) {
    const g = MUSCLE_GROUP[m];
    if (g) count.set(g, (count.get(g) ?? 0) + 1);
  }
  let best: Group | null = null;
  for (const [g, n] of count) if (!best || n > count.get(best)!) best = g;
  return best;
}

/** Ticked sets per group across finished workouts started in the last `days` days. */
export function groupSets(
  history: Workout[],
  days: number,
  lookup: (id: string) => Exercise | undefined,
  now = new Date(),
): Record<Group, number> {
  const out: Record<Group, number> = { push: 0, pull: 0, legs: 0, core: 0 };
  const cutoff = now.getTime() - days * 86400000;
  for (const w of history) {
    if (!w.finishedAt || new Date(w.startedAt).getTime() < cutoff) continue;
    for (const b of w.blocks)
      for (const i of b.items) {
        if (i.status === 'skipped') continue;
        const ex = lookup(i.exerciseId);
        const g = ex && exerciseGroup(ex);
        if (g) out[g] += i.sets.filter((s) => s.done).length;
      }
  }
  return out;
}

/** Push vs pull verdict. More pull than push is fine; noticeably more push is worth fixing. */
export function balanceNote(push: number, pull: number): string {
  if (!push && !pull) return 'No upper-body sets yet';
  if (push > pull * 1.2) return 'More push than pull — add a pulling set or two';
  if (pull > push * 1.2) return 'More pull than push — that’s fine for your shoulders';
  return 'Balanced';
}
