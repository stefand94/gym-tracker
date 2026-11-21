import { describe, expect, it } from 'vitest';
import type { RoutineBlock } from '../types';
import { fromEditor, removeItems, splitSuperset, toEditor, updateItem } from './routineBlocks';

const blocks: RoutineBlock[] = [
  { items: [{ exerciseId: 'a' }, { exerciseId: 'b' }] },
  { superset: true, items: [{ exerciseId: 'c', sets: 3 }, { exerciseId: 'd' }] },
  { rehabDose: 'hamstring', items: [{ exerciseId: 'e' }, { exerciseId: 'f' }] },
];

describe('routine editor blocks', () => {
  it('gives a plain block one block per exercise and keeps supersets and the rehab dose whole', () => {
    const e = toEditor(blocks);
    expect(e.map((b) => b.items.map((i) => i.exerciseId))).toEqual([['a'], ['b'], ['c', 'd'], ['e', 'f']]);
    expect(e[2].superset).toBe(true);
    expect(e[3].rehabDose).toBe('hamstring');
    expect(e[3].superset).toBe(false);
  });

  it('round-trips without the editor ids', () => {
    expect(fromEditor(toEditor(blocks))).toEqual([
      { items: [{ exerciseId: 'a' }] },
      { items: [{ exerciseId: 'b' }] },
      { superset: true, items: [{ exerciseId: 'c', sets: 3 }, { exerciseId: 'd' }] },
      { rehabDose: 'hamstring', items: [{ exerciseId: 'e' }, { exerciseId: 'f' }] },
    ]);
  });

  it('turns a superset left with one exercise into a plain block, and drops empty blocks', () => {
    const e = toEditor(blocks);
    const d = e[2].items[1].id;
    const after = removeItems(e, [d, e[0].items[0].id]);
    expect(after.map((b) => b.items.map((i) => i.exerciseId))).toEqual([['b'], ['c'], ['e', 'f']]);
    expect(after[1].superset).toBe(false);
  });

  it('splits a superset into one block each, the first keeping the id', () => {
    const e = toEditor(blocks);
    const after = splitSuperset(e, e[2].id);
    expect(after).toHaveLength(5);
    expect(after[2].id).toBe(e[2].id);
    expect(after[3].items[0].exerciseId).toBe('d');
  });

  it('patches one item', () => {
    const e = toEditor(blocks);
    const after = updateItem(e, e[1].items[0].id, { reps: 12 });
    expect(fromEditor(after)[1]).toEqual({ items: [{ exerciseId: 'b', reps: 12 }] });
  });
});
