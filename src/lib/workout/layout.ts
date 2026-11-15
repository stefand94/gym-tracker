/** How a workout's exercises are laid out in blocks: drag-and-drop, supersets and the rehab dose's edge. */

import type { Workout, WorkoutBlock } from '../../types';
import { uid } from '../id';

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

/** Same blocks, same exercises, same order? */
export function sameLayout(a: { id: string; items: { id: string }[] }[], b: { id: string; items: { id: string }[] }[]): boolean {
  const sig = (x: typeof a) => x.map((bl) => bl.items.map((i) => i.id).join(',')).join('|');
  return sig(a) === sig(b);
}
