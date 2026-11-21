import type { Exercise, RoutineBlock, RoutineItem } from '../types';
import { uid } from './id';

/** The routine editor's blocks: every item and block gets an id so React and the reorder sheet can track it. */
export type EItem = RoutineItem & { id: string };
export type EBlock = { id: string; superset?: boolean; rehabDose?: RoutineBlock['rehabDose']; items: EItem[] };

/** Editor blocks: a plain block with several exercises becomes one block each (as in a workout). */
export function toEditor(blocks: RoutineBlock[]): EBlock[] {
  return blocks.flatMap((b) => {
    const items = b.items.map((i) => ({ ...i, id: uid() }));
    if (b.rehabDose || (b.superset && items.length > 1)) return [{ id: uid(), superset: !b.rehabDose, rehabDose: b.rehabDose, items }];
    return items.map((i) => ({ id: uid(), items: [i] }));
  });
}

export function fromEditor(blocks: EBlock[]): RoutineBlock[] {
  return blocks
    .filter((b) => b.items.length)
    .map((b) => {
      const items = b.items.map(({ id: _id, ...i }) => i);
      if (b.rehabDose) return { rehabDose: b.rehabDose, items };
      return b.superset && items.length > 1 ? { superset: true, items } : { items };
    });
}

export const updateItem = (bs: EBlock[], itemId: string, patch: Partial<RoutineItem>): EBlock[] =>
  bs.map((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));

/** Remove items; a superset left with one exercise becomes a plain block, an empty block goes. */
export const removeItems = (bs: EBlock[], ids: string[]): EBlock[] =>
  bs
    .map((b) => {
      const items = b.items.filter((i) => !ids.includes(i.id));
      return { ...b, items, superset: !!b.superset && items.length > 1 };
    })
    .filter((b) => b.items.length);

/** A superset back to one block per exercise (the first keeps the block's id). */
export const splitSuperset = (bs: EBlock[], blockId: string): EBlock[] =>
  bs.flatMap((b) => (b.id === blockId ? b.items.map((i, n) => ({ id: n ? uid() : b.id, items: [i] })) : [b]));

/** An exercise added at the end with its default sets and reps (or seconds). */
export function appendExercise(bs: EBlock[], ex: Exercise): EBlock[] {
  const d = ex.defaults;
  const item: EItem = {
    id: uid(),
    exerciseId: ex.id,
    sets: d.sets,
    ...(ex.type === 'timed' ? { seconds: d.seconds } : { reps: d.reps }),
  };
  return [...bs, { id: uid(), items: [item] }];
}
