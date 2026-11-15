import type { Workout, WorkoutItem } from '../../types';

export function deriveStatus(item: WorkoutItem): WorkoutItem {
  if (item.status === 'skipped') return item;
  const done = item.sets.length > 0 && item.sets.every((s) => s.done);
  const status = done ? 'done' : 'pending';
  return status === item.status ? item : { ...item, status };
}

/** Apply `fn` to one item, then re-derive its status from its sets. */
export function mapItem(w: Workout, itemId: string, fn: (i: WorkoutItem) => WorkoutItem): Workout {
  return {
    ...w,
    blocks: w.blocks.map((b) =>
      b.items.some((i) => i.id === itemId) ? { ...b, items: b.items.map((i) => (i.id === itemId ? deriveStatus(fn(i)) : i)) } : b,
    ),
  };
}
