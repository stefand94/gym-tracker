/** How a workout's exercises are laid out in blocks: the reorder sheet's moves, supersets and the rehab dose's edge. */

import type { Workout, WorkoutBlock } from '../../types';
import { uid } from '../id';

/** Where a moved exercise lands: a new block in gap n (0 = before the first block), or into a block as a superset. */
export type DropTarget = { gap: number } | { join: string };

interface BlockLike<I extends { id: string }> {
  id: string;
  superset?: boolean;
  rehabDose?: string;
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
 * `moveItems` with the rehab dose's edge: its exercises never share a block with the rest (that's how the finish
 * screen and the planner tell them apart), so a join across that edge is refused, and dose exercises moved to a gap
 * stay marked.
 */
export function moveBlocks<I extends { id: string }, B extends BlockLike<I>>(
  blocks: B[],
  ids: string[],
  target: DropTarget,
  newId: () => string = uid,
): B[] {
  const set = new Set(ids);
  const doses = new Set(blocks.filter((b) => b.items.some((i) => set.has(i.id))).map((b) => b.rehabDose));
  if (doses.size !== 1) return blocks;
  const [dose] = doses;
  if ('join' in target && blocks.find((b) => b.id === target.join)?.rehabDose !== dose) return blocks;
  const old = new Set(blocks.map((b) => b.id));
  const out = moveItems(blocks, ids, target, newId);
  if (out === blocks) return blocks;
  return dose ? out.map((b) => (old.has(b.id) ? b : { ...b, rehabDose: dose })) : out;
}

/** Move a workout's exercises (see `moveBlocks`). */
export function moveInWorkout(w: Workout, ids: string[], target: DropTarget): Workout {
  const blocks = moveBlocks(w.blocks, ids, target);
  return blocks === w.blocks ? w : { ...w, blocks };
}

/** Move the block at `from` so it ends up at index `to`. */
export function moveBlock<B>(blocks: B[], from: number, to: number): B[] {
  if (from === to || from < 0 || from >= blocks.length) return blocks;
  const out = [...blocks];
  const [b] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, b);
  return out;
}

/** Swap an exercise with its neighbour in the same block (`dir` −1 = up, 1 = down). */
export function shiftInBlock<I extends { id: string }, B extends BlockLike<I>>(blocks: B[], itemId: string, dir: -1 | 1): B[] {
  return blocks.map((b) => {
    const k = b.items.findIndex((i) => i.id === itemId);
    if (k < 0 || k + dir < 0 || k + dir >= b.items.length) return b;
    const items = [...b.items];
    [items[k], items[k + dir]] = [items[k + dir], items[k]];
    return { ...b, items };
  });
}

/** Take an exercise out of its superset: it becomes its own block, straight after the superset. */
export function standAlone<I extends { id: string }, B extends BlockLike<I>>(blocks: B[], itemId: string, newId: () => string = uid): B[] {
  const at = blocks.findIndex((b) => b.items.some((i) => i.id === itemId));
  if (at < 0 || blocks[at].items.length < 2) return blocks;
  return moveBlocks(blocks, [itemId], { gap: at + 1 }, newId);
}

/**
 * Rebuild blocks in a new arrangement (from the reorder sheet), keeping each exercise as it is now. Exercises the
 * arrangement doesn't know about stay at the end; blocks left empty go.
 */
export function applyLayout<I extends { id: string }, B extends BlockLike<I>>(
  blocks: B[],
  layout: { id: string; superset?: boolean; rehabDose?: string; items: { id: string }[] }[],
): B[] {
  const items = new Map(blocks.flatMap((b) => b.items).map((i) => [i.id, i]));
  const old = new Map(blocks.map((b) => [b.id, b]));
  const placed = new Set(layout.flatMap((l) => l.items.map((i) => i.id)));
  const out = layout.flatMap((l) => {
    const its = l.items.flatMap((i) => (items.has(i.id) ? [items.get(i.id)!] : []));
    if (!its.length) return [];
    const { rehabDose: _r, ...base } = old.get(l.id) ?? ({} as Partial<B>);
    return [
      { ...base, id: l.id, superset: !!l.superset && its.length > 1, ...(l.rehabDose ? { rehabDose: l.rehabDose } : {}), items: its } as B,
    ];
  });
  const rest = blocks.flatMap((b) => {
    const its = b.items.filter((i) => !placed.has(i.id));
    return its.length ? [{ ...b, items: its, superset: !!b.superset && its.length > 1 }] : [];
  });
  return [...out, ...rest];
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
