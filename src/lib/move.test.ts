import { describe, expect, it } from 'vitest';
import type { Workout } from '../types';
import {
  applyLayout,
  canSupersetWithNext,
  moveBlock,
  moveBlocks,
  moveInWorkout,
  moveItems,
  sameLayout,
  shiftInBlock,
  splitBlock,
  standAlone,
  supersetWithNext,
} from './workout';

type B = { id: string; superset?: boolean; rehabDose?: string; items: { id: string }[] };
const blk = (id: string, ...items: string[]): B => ({ id, superset: items.length > 1, items: items.map((i) => ({ id: i })) });
const shape = (bs: B[]) => bs.map((b) => `${b.superset ? 'S' : ''}${b.items.map((i) => i.id).join('+')}`);
let n = 0;
const newId = () => `new${++n}`;

// A | B+C (superset) | D
const start = () => [blk('a', 'A'), blk('bc', 'B', 'C'), blk('d', 'D')];

describe('moveItems', () => {
  it('reorders a whole block and keeps its id', () => {
    const out = moveItems(start(), ['A'], { gap: 3 }, newId);
    expect(shape(out)).toEqual(['SB+C', 'D', 'A']);
    expect(out[2].id).toBe('a');
    expect(shape(moveItems(start(), ['D'], { gap: 0 }, newId))).toEqual(['D', 'A', 'SB+C']);
  });

  it('moving a block next to itself changes nothing', () => {
    const s = start();
    expect(sameLayout(moveItems(s, ['A'], { gap: 0 }, newId), s)).toBe(true);
    expect(sameLayout(moveItems(s, ['A'], { gap: 1 }, newId), s)).toBe(true);
  });

  it('joins a block as a superset', () => {
    const out = moveItems(start(), ['D'], { join: 'a' }, newId);
    expect(shape(out)).toEqual(['SA+D', 'SB+C']);
    expect(out[0].id).toBe('a');
  });

  it('joins an existing superset', () => {
    expect(shape(moveItems(start(), ['A'], { join: 'bc' }, newId))).toEqual(['SB+C+A', 'D']);
  });

  it('splits an exercise out of a superset', () => {
    const out = moveItems(start(), ['C'], { gap: 3 }, newId);
    expect(shape(out)).toEqual(['A', 'B', 'D', 'C']);
    expect(out[1].superset).toBe(false);
    expect(out[3].id).toMatch(/^new/);
    // out to the gap right after its own block
    expect(shape(moveItems(start(), ['B'], { gap: 2 }, newId))).toEqual(['A', 'C', 'B', 'D']);
  });

  it('moves a whole superset', () => {
    const out = moveItems(start(), ['B', 'C'], { gap: 0 }, newId);
    expect(shape(out)).toEqual(['SB+C', 'A', 'D']);
    expect(out[0].id).toBe('bc');
    expect(shape(moveItems(start(), ['B', 'C'], { join: 'd' }, newId))).toEqual(['A', 'SD+B+C']);
  });

  it('ignores joining a block to itself or unknown ids', () => {
    const s = start();
    expect(moveItems(s, ['B', 'C'], { join: 'bc' }, newId)).toBe(s);
    expect(moveItems(s, ['B'], { join: 'bc' }, newId)).toBe(s);
    expect(moveItems(s, ['Z'], { gap: 0 }, newId)).toBe(s);
  });
});

describe('the rehab dose stays its own block', () => {
  const item = (id: string) => ({ id, exerciseId: 'nordic-curl', status: 'pending' as const, sets: [] });
  const w = (): Workout => ({
    id: 'w',
    name: 'w',
    startedAt: '',
    blocks: [
      { id: 'a', superset: false, items: [item('A')] },
      { id: 'd1', superset: false, rehabDose: 'hamstring', items: [item('D1')] },
      { id: 'd2', superset: false, rehabDose: 'hamstring', items: [item('D2')] },
    ],
  });

  it('refuses joins across the edge, keeps the mark on joins inside it and on gap moves', () => {
    expect(moveInWorkout(w(), ['A'], { join: 'd1' })).toEqual(w());
    expect(moveInWorkout(w(), ['D1'], { join: 'a' })).toEqual(w());
    const joined = moveInWorkout(w(), ['D2'], { join: 'd1' });
    expect(joined.blocks.map((b) => b.rehabDose)).toEqual([undefined, 'hamstring']);
    const out = moveInWorkout(joined, ['D2'], { gap: 0 });
    expect(out.blocks.map((b) => [b.items.map((i) => i.id).join('+'), b.rehabDose])).toEqual([
      ['D2', 'hamstring'],
      ['A', undefined],
      ['D1', 'hamstring'],
    ]);
  });

  it('superset with next and split keep the mark, and never mix it with other exercises', () => {
    expect(canSupersetWithNext(w(), 'a')).toBe(false);
    expect(supersetWithNext(w(), 'a')).toEqual(w());
    const ss = supersetWithNext(w(), 'd1');
    expect(ss.blocks[1]).toMatchObject({ superset: true, rehabDose: 'hamstring' });
    expect(splitBlock(ss, 'd1').blocks.map((b) => b.rehabDose)).toEqual([undefined, 'hamstring', 'hamstring']);
  });
});

describe('the reorder sheet', () => {
  it('moves whole blocks by index', () => {
    expect(shape(moveBlock(start(), 0, 2))).toEqual(['SB+C', 'D', 'A']);
    expect(shape(moveBlock(start(), 2, 0))).toEqual(['D', 'A', 'SB+C']);
    const s = start();
    expect(moveBlock(s, 1, 1)).toBe(s);
  });

  it('swaps exercises inside a superset, not past its ends', () => {
    expect(shape(shiftInBlock(start(), 'C', -1))).toEqual(['A', 'SC+B', 'D']);
    expect(shape(shiftInBlock(start(), 'B', -1))).toEqual(['A', 'SB+C', 'D']);
    expect(shape(shiftInBlock(start(), 'A', 1))).toEqual(['A', 'SB+C', 'D']);
  });

  it('takes an exercise out of a superset to just after it', () => {
    expect(shape(standAlone(start(), 'B', newId))).toEqual(['A', 'C', 'B', 'D']);
    const s = start();
    expect(standAlone(s, 'A', newId)).toBe(s);
  });

  it('joins through the Superset menu, never across the rehab dose', () => {
    const withDose = [...start(), { id: 'dose', rehabDose: 'hamstring', items: [{ id: 'H' }] }];
    expect(shape(moveBlocks(withDose, ['D'], { join: 'a' }, newId))).toEqual(['SA+D', 'SB+C', 'H']);
    expect(moveBlocks(withDose, ['A'], { join: 'dose' }, newId)).toBe(withDose);
    expect(moveBlocks(withDose, ['H'], { join: 'a' }, newId)).toBe(withDose);
  });

  it('applies a new arrangement to the real blocks, keeping each exercise as it is now', () => {
    type Item = { id: string; reps: number };
    type Blk = { id: string; superset: boolean; rehabDose?: string; note?: string; items: Item[] };
    const real: Blk[] = [
      { id: 'a', superset: false, note: 'kept', items: [{ id: 'A', reps: 5 }] },
      {
        id: 'bc',
        superset: true,
        items: [
          { id: 'B', reps: 6 },
          { id: 'C', reps: 7 },
        ],
      },
      { id: 'dose', superset: false, rehabDose: 'hamstring', items: [{ id: 'H', reps: 8 }] },
      { id: 'x', superset: false, items: [{ id: 'X', reps: 9 }] },
    ];
    const out = applyLayout(real, [
      { id: 'dose', superset: false, rehabDose: 'hamstring', items: [{ id: 'H' }] },
      { id: 'a', superset: true, items: [{ id: 'A' }, { id: 'C' }] },
      { id: 'n1', superset: false, items: [{ id: 'B' }] },
    ]);
    expect(out.map((b) => [b.id, b.superset, b.rehabDose, b.items.map((i) => `${i.id}${i.reps}`).join('+')])).toEqual([
      ['dose', false, 'hamstring', 'H8'],
      ['a', true, undefined, 'A5+C7'],
      ['n1', false, undefined, 'B6'],
      // added while the sheet was open: kept at the end
      ['x', false, undefined, 'X9'],
    ]);
    expect(out[1].note).toBe('kept');
  });
});
