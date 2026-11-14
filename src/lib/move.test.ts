import { describe, expect, it } from 'vitest';
import { moveItems, sameLayout } from './workout';

type B = { id: string; superset?: boolean; items: { id: string }[] };
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
