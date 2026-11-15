/** Read-only questions about where a workout stands. */

import type { Workout, WorkoutBlock } from '../../types';

export function blockComplete(block: WorkoutBlock): boolean {
  return block.items.every((i) => i.status !== 'pending');
}

/** Index of the first block with an exercise still to do, or -1 when everything is done or skipped. */
export function currentBlockIndex(w: Workout): number {
  return w.blocks.findIndex((b) => !blockComplete(b));
}

/** True when every non-skipped exercise in the block that has a set at this round has ticked it. */
export function roundComplete(block: WorkoutBlock, round: number): boolean {
  return block.items.filter((i) => i.status !== 'skipped' && round < i.sets.length).every((i) => i.sets[round].done);
}

/** Whether ticking this set should start a rest: always in a single block, only at the end of a round in a superset. */
export function restsAfter(w: Workout, itemId: string, setIndex: number): boolean {
  const block = w.blocks.find((b) => b.items.some((i) => i.id === itemId));
  if (!block || !block.superset) return true;
  return roundComplete(block, setIndex);
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
