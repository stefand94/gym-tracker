import { describe, expect, it } from 'vitest';
import { getExercise } from '../data/library';
import type { Workout } from '../types';
import { allStations, lastPerformance, lastStation, stationsFor } from './prefill';
import { metricsFor, series, stationsIn } from './progress';
import { makeItem, setStation } from './workout';

const EX = 'seated-cable-row';
const ex = getExercise(EX)!;

let day = 1;
function done(weight: number, station?: string, exerciseId = EX): Workout {
  const t = new Date(Date.UTC(2026, 10, day++, 9)).toISOString();
  return {
    id: `w${day}`,
    name: 'W',
    startedAt: t,
    finishedAt: t,
    blocks: [
      {
        id: 'b',
        superset: false,
        items: [{ id: 'i', exerciseId, status: 'done', ...(station ? { station } : {}), sets: [{ weight, reps: 8, done: true }] }], // under the 10-rep target: no go-up
      },
    ],
  };
}

describe('stations', () => {
  const history = [done(40, 'Upstairs 1'), done(30, 'Downstairs'), done(35), done(12, 'Cable 2', 'triceps-pushdown')];

  it('lists stations most recent first, case-insensitively unique', () => {
    expect(stationsFor(EX, [...history, done(41, 'upstairs  1')])).toEqual(['upstairs  1', 'Downstairs']);
    expect(allStations(history)).toEqual(['Cable 2', 'Downstairs', 'Upstairs 1']);
    expect(lastStation(EX, history)).toBeUndefined(); // last time had none
    expect(lastStation(EX, history.slice(0, 2))).toBe('Downstairs');
  });

  it('prefill prefers the same station and falls back to any', () => {
    expect(lastPerformance(EX, history, 'Upstairs 1')?.[0].weight).toBe(40);
    expect(lastPerformance(EX, history, 'upstairs 1')?.[0].weight).toBe(40);
    expect(lastPerformance(EX, history, 'Nowhere')?.[0].weight).toBe(35);
    expect(lastPerformance(EX, history, 'Nowhere', true)).toBeNull();
    expect(lastPerformance(EX, history)?.[0].weight).toBe(35);
  });

  it('a new item defaults to the last station and its weights', () => {
    const item = makeItem(ex, history.slice(0, 2));
    expect(item.station).toBe('Downstairs');
    expect(item.sets[0].weight).toBe(30);
    expect(makeItem(ex, history, { exerciseId: EX, station: 'Upstairs 1' }).sets[0].weight).toBe(40);
  });

  it('changing station re-fills only the unticked sets', () => {
    const item = makeItem(ex, history, { exerciseId: EX, sets: 3 });
    item.sets[0] = { ...item.sets[0], weight: 33, done: true };
    const w: Workout = { id: 'x', name: 'x', startedAt: '', blocks: [{ id: 'b', superset: false, items: [item] }] };
    const next = setStation(w, item.id, '  Upstairs   1 ', history, getExercise).blocks[0].items[0];
    expect(next.station).toBe('Upstairs 1');
    expect(next.sets.map((s) => s.weight)).toEqual([33, 40, 40]);
    // unknown station: weights left alone
    const other = setStation(w, item.id, 'New one', history, getExercise).blocks[0].items[0];
    expect(other.sets.map((s) => s.weight)).toEqual([33, 35, 35]);
    expect(setStation(w, item.id, undefined, history, getExercise).blocks[0].items[0].station).toBeUndefined();
  });

  it('splits the progress series by station', () => {
    const m = metricsFor(ex.type)[0];
    expect(stationsIn(ex, history)).toEqual(['Downstairs', 'Upstairs 1', null]);
    expect(series(ex, m, history).length).toBe(3);
    expect(series(ex, m, history, 'Upstairs 1').length).toBe(1);
    expect(series(ex, m, history, null).length).toBe(1);
  });
});
