import { describe, expect, it } from 'vitest';
import type { Exercise, Routine, Workout } from '../types';
import {
  addSet,
  blockComplete,
  removeItem,
  splitBlock,
  supersetWithNext,
  toggleComplete,
  toggleSet,
  toggleSkip,
  updateSet,
  updateUnticked,
  updateSetForward,
  currentBlockIndex,
  roundComplete,
  addRound,
  workoutFromRoutine,
  addExercise,
  emptyWorkout,
  workoutProgress,
  replaceItem,
} from './workout';
import { rankReplacements, similarity } from './similar';
import { lastPerformance } from './prefill';
import { lastTrained, loadSince, workoutLoad } from './muscleLoad';
import { epley, metricsFor, series } from './progress';
import { itemSummary } from './format';

const curl: Exercise = {
  id: 'hammer-curl',
  name: 'Hammer curl',
  type: 'weight',
  equipment: 'Dumbbells',
  primary: ['biceps'],
  secondary: ['forearms'],
  defaults: { sets: 3, reps: 8, weight: 10 },
};
const pushup: Exercise = {
  id: 'push-up',
  name: 'Push-up',
  type: 'bodyweight',
  equipment: 'Bodyweight',
  primary: ['chest'],
  secondary: ['triceps', 'frontDelts'],
  defaults: { sets: 3, reps: 15 },
};
const plank: Exercise = {
  id: 'plank',
  name: 'Plank',
  type: 'timed',
  equipment: 'Bodyweight',
  primary: ['abs'],
  secondary: [],
  defaults: { sets: 3, seconds: 45 },
};
const lib: Record<string, Exercise> = { [curl.id]: curl, [pushup.id]: pushup, [plank.id]: plank };
const lookup = (id: string) => lib[id];

const routine: Routine = {
  id: 'arms',
  name: 'Arms',
  blocks: [{ items: [{ exerciseId: 'hammer-curl' }] }, { superset: true, items: [{ exerciseId: 'push-up' }, { exerciseId: 'plank', sets: 2 }] }],
};

function fresh(history: Workout[] = []) {
  return workoutFromRoutine(routine, history, lookup, new Date('2026-11-01T10:00:00Z'));
}
const itemId = (w: Workout, b: number, i = 0) => w.blocks[b].items[i].id;

describe('building a workout', () => {
  it('uses exercise defaults and routine overrides', () => {
    const w = fresh();
    expect(w.blocks).toHaveLength(2);
    expect(w.blocks[0].items[0].sets).toEqual([
      { reps: 8, weight: 10, done: false },
      { reps: 8, weight: 10, done: false },
      { reps: 8, weight: 10, done: false },
    ]);
    expect(w.blocks[1].superset).toBe(true);
    expect(w.blocks[1].items[0].sets[0]).toEqual({ reps: 15, done: false });
    expect(w.blocks[1].items[1].sets).toEqual([
      { seconds: 45, done: false },
      { seconds: 45, done: false },
    ]);
  });

  it('pre-fills from the last finished workout', () => {
    let prev = fresh();
    prev = updateSet(prev, itemId(prev, 0), 0, { weight: 12, reps: 10 });
    prev = updateSet(prev, itemId(prev, 0), 1, { weight: 12, reps: 9 });
    prev = toggleSet(prev, itemId(prev, 0), 0);
    prev = toggleSet(prev, itemId(prev, 0), 1);
    prev.finishedAt = '2026-11-01T11:00:00Z';
    expect(lastPerformance('hammer-curl', [prev])).toHaveLength(2);
    const next = fresh([prev]);
    // routine doesn't fix set count → uses last time's count (2 done sets)
    expect(next.blocks[0].items[0].sets).toEqual([
      { weight: 12, reps: 10, done: false },
      { weight: 12, reps: 9, done: false },
    ]);
  });
});

describe('ticking sets', () => {
  it('auto-completes an exercise after all sets are ticked', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = toggleSet(w, id, 0);
    w = toggleSet(w, id, 1);
    expect(w.blocks[0].items[0].status).toBe('pending');
    w = toggleSet(w, id, 2);
    expect(w.blocks[0].items[0].status).toBe('done');
    w = toggleSet(w, id, 1);
    expect(w.blocks[0].items[0].status).toBe('pending');
  });

  it('complete-all ticks every set and toggles back', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = toggleComplete(w, id);
    expect(w.blocks[0].items[0].sets.every((s) => s.done)).toBe(true);
    expect(w.blocks[0].items[0].status).toBe('done');
    w = toggleComplete(w, id);
    expect(w.blocks[0].items[0].sets.some((s) => s.done)).toBe(false);
  });

  it('skip clears ticks and can be undone', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = toggleSet(w, id, 0);
    w = toggleSkip(w, id);
    expect(w.blocks[0].items[0].status).toBe('skipped');
    expect(w.blocks[0].items[0].sets.some((s) => s.done)).toBe(false);
    w = toggleSkip(w, id);
    expect(w.blocks[0].items[0].status).toBe('pending');
  });

  it('editing the exercise default only changes unticked sets', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = toggleSet(w, id, 0);
    w = updateUnticked(w, id, { weight: 14 });
    expect(w.blocks[0].items[0].sets.map((s) => s.weight)).toEqual([10, 14, 14]);
  });

  it('changing a set carries forward to later unticked sets only', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = addSet(w, id);
    w = toggleSet(w, id, 0);
    w = toggleSet(w, id, 2);
    w = updateSetForward(w, id, 1, { weight: 12 });
    // set 0 is earlier, set 2 is ticked: both keep 10
    expect(w.blocks[0].items[0].sets.map((s) => s.weight)).toEqual([10, 12, 10, 12]);
  });

  it('summarises an exercise in one line', () => {
    let w = fresh();
    const id = itemId(w, 0);
    expect(itemSummary(curl, w.blocks[0].items[0])).toBe('3 × 8 · 10 kg');
    w = updateSet(w, id, 2, { weight: 12 });
    expect(itemSummary(curl, w.blocks[0].items[0])).toBe('3 × 8 · top 12 kg');
    expect(itemSummary(plank, w.blocks[1].items[1])).toBe('2 × 45 s');
    w = toggleSkip(w, id);
    expect(itemSummary(curl, w.blocks[0].items[0])).toBe('Skipped');
  });

  it('adding a set reopens a completed exercise', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = toggleComplete(w, id);
    w = addSet(w, id);
    expect(w.blocks[0].items[0].sets).toHaveLength(4);
    expect(w.blocks[0].items[0].status).toBe('pending');
  });
});

describe('supersets', () => {
  it('block completes when every item is done or skipped', () => {
    let w = fresh();
    expect(blockComplete(w.blocks[1])).toBe(false);
    w = toggleComplete(w, itemId(w, 1, 0));
    expect(blockComplete(w.blocks[1])).toBe(false);
    w = toggleSkip(w, itemId(w, 1, 1));
    expect(blockComplete(w.blocks[1])).toBe(true);
  });

  it('tracks the current block and completed rounds', () => {
    let w = fresh();
    expect(currentBlockIndex(w)).toBe(0);
    w = toggleComplete(w, itemId(w, 0));
    expect(currentBlockIndex(w)).toBe(1);
    w = toggleSet(w, itemId(w, 1, 0), 0);
    expect(roundComplete(w.blocks[1], 0)).toBe(false);
    w = toggleSet(w, itemId(w, 1, 1), 0);
    expect(roundComplete(w.blocks[1], 0)).toBe(true);
    // round 2 only exists for push-ups (plank has 2 sets)
    w = toggleSet(w, itemId(w, 1, 0), 2);
    expect(roundComplete(w.blocks[1], 2)).toBe(true);
    w = toggleComplete(w, itemId(w, 1, 0));
    w = toggleSkip(w, itemId(w, 1, 1));
    expect(currentBlockIndex(w)).toBe(-1);
  });

  it('adds a round to every non-skipped exercise', () => {
    let w = fresh();
    w = toggleSkip(w, itemId(w, 1, 1));
    w = addRound(w, w.blocks[1].id);
    expect(w.blocks[1].items.map((i) => i.sets.length)).toEqual([4, 2]);
  });

  it('merges and splits blocks', () => {
    let w = fresh();
    w = splitBlock(w, w.blocks[1].id);
    expect(w.blocks).toHaveLength(3);
    w = supersetWithNext(w, w.blocks[0].id);
    expect(w.blocks).toHaveLength(2);
    expect(w.blocks[0].superset).toBe(true);
    expect(w.blocks[0].items.map((i) => i.exerciseId)).toEqual(['hammer-curl', 'push-up']);
  });

  it('removing an item from a 2-item superset un-supersets it', () => {
    let w = fresh();
    w = removeItem(w, itemId(w, 1, 1));
    expect(w.blocks[1].superset).toBe(false);
  });
});

describe('muscle load', () => {
  it('credits 1 per done set to primary and 0.5 to secondary, ignoring skipped', () => {
    let w = fresh();
    w = toggleSet(w, itemId(w, 0), 0);
    w = toggleSet(w, itemId(w, 0), 1);
    w = toggleComplete(w, itemId(w, 1, 0));
    w = toggleSkip(w, itemId(w, 1, 1));
    const load = workoutLoad(w, lookup);
    expect(load.biceps).toBe(2);
    expect(load.forearms).toBe(1);
    expect(load.chest).toBe(3);
    expect(load.triceps).toBe(1.5);
    expect(load.abs).toBe(0);
  });

  it('filters by period and finished state', () => {
    let a = fresh();
    a = toggleComplete(a, itemId(a, 0));
    a.finishedAt = a.startedAt;
    let b = workoutFromRoutine(routine, [], lookup, new Date('2026-09-01T10:00:00Z'));
    b = toggleComplete(b, itemId(b, 0));
    b.finishedAt = b.startedAt;
    let c = fresh(); // unfinished
    c = toggleComplete(c, itemId(c, 0));
    const now = new Date('2026-11-05T00:00:00Z');
    expect(loadSince([a, b, c], 7, lookup, now).biceps).toBe(3);
    expect(loadSince([a, b, c], 90, lookup, now).biceps).toBe(6);
    expect(lastTrained([a, b, c], lookup).biceps).toBe(a.startedAt);
    expect(lastTrained([a, b, c], lookup).abs).toBeUndefined();
  });
});

describe('progress', () => {
  it('epley', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(60, 10)).toBeCloseTo(80);
  });

  it('computes series per metric', () => {
    let w = fresh();
    const id = itemId(w, 0);
    w = updateSet(w, id, 2, { weight: 12, reps: 6 });
    w = toggleComplete(w, id);
    w.finishedAt = w.startedAt;
    const [top, e1rm, vol] = metricsFor('weight');
    expect(series(curl, top, [w])).toEqual([{ date: w.startedAt, value: 12 }]);
    expect(series(curl, e1rm, [w])[0].value).toBeCloseTo(14.4);
    expect(series(curl, vol, [w])[0].value).toBe(10 * 8 * 2 + 12 * 6);
  });

  it('empty workout + add exercise + progress counter', () => {
    let w = emptyWorkout();
    w = addExercise(w, plank, []);
    expect(workoutProgress(w)).toEqual({ done: 0, total: 3 });
    w = toggleSet(w, itemId(w, 0), 0);
    expect(workoutProgress(w)).toEqual({ done: 1, total: 3 });
  });
});

describe('seed data', async () => {
  const { EXERCISES, ROUTINES } = await import('../data/library');
  const { isMuscleId } = await import('../data/muscles');
  it('exercises use valid muscle ids and unique ids', () => {
    const ids = new Set<string>();
    for (const e of EXERCISES) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      for (const m of [...e.primary, ...e.secondary]) expect(isMuscleId(m), `${e.id}: ${m}`).toBe(true);
      expect(e.primary.length, e.id).toBeGreaterThan(0);
    }
  });
  it('routines reference real exercises', () => {
    for (const r of ROUTINES) for (const b of r.blocks) for (const i of b.items) expect(ids(EXERCISES).has(i.exerciseId), i.exerciseId).toBe(true);
  });
  const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
});

describe('replacing an exercise', () => {
  const pulldown: Exercise = {
    id: 'lat-pulldown', name: 'Lat pulldown', type: 'machine', equipment: 'Cable',
    primary: ['lats'], secondary: ['biceps', 'upperBack'], defaults: { sets: 3, reps: 10, weight: 40 },
  };
  const pullup: Exercise = {
    id: 'pull-up', name: 'Pull-up', type: 'bodyweight', equipment: 'Bodyweight',
    primary: ['lats'], secondary: ['biceps', 'upperBack', 'forearms'], defaults: { sets: 3, reps: 8 },
  };
  const row: Exercise = {
    id: 'seated-cable-row', name: 'Seated cable row', type: 'machine', equipment: 'Cable',
    primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts'], defaults: { sets: 3, reps: 10, weight: 40 },
  };

  it('ranks exercises with the same main muscles first, closest overlap first', () => {
    expect(similarity(pulldown, pulldown)).toBe(1);
    expect(similarity(pulldown, pullup)).toBeGreaterThan(similarity(pulldown, row));
    expect(similarity(pulldown, plank)).toBe(0);
    const r = rankReplacements(pulldown, [pulldown, plank, curl, row, pullup]);
    expect(r.close.map((e) => e.id)).toEqual(['pull-up', 'seated-cable-row']);
    expect(r.other.map((e) => e.id)).toEqual(['hammer-curl', 'plank']);
  });

  it('swaps in place when nothing is ticked, keeping the set count', () => {
    const w = fresh();
    const out = replaceItem(w, itemId(w, 0), pullup, []);
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[0].items[0].exerciseId).toBe('pull-up');
    expect(out.blocks[0].items[0].sets).toHaveLength(3);
    expect(out.blocks[0].items[0].sets[0]).toEqual({ reps: 8, done: false });
  });

  it('keeps ticked sets on the old exercise and adds the rest as the new one', () => {
    let w = fresh();
    w = toggleSet(w, itemId(w, 0), 0);
    const out = replaceItem(w, itemId(w, 0), pullup, []);
    expect(out.blocks).toHaveLength(3);
    expect(out.blocks[0].items[0]).toMatchObject({ exerciseId: 'hammer-curl', status: 'done' });
    expect(out.blocks[0].items[0].sets).toHaveLength(1);
    expect(out.blocks[1].items[0].exerciseId).toBe('pull-up');
    expect(out.blocks[1].items[0].sets).toHaveLength(2);
  });

  it('stays inside the superset', () => {
    let w = fresh();
    const out = replaceItem(w, itemId(w, 1, 1), curl, []);
    expect(out.blocks[1].superset).toBe(true);
    expect(out.blocks[1].items.map((i) => i.exerciseId)).toEqual(['push-up', 'hammer-curl']);
    w = toggleSet(w, itemId(w, 1, 0), 0);
    const out2 = replaceItem(w, itemId(w, 1, 0), curl, []);
    expect(out2.blocks[1].items.map((i) => i.exerciseId)).toEqual(['push-up', 'hammer-curl', 'plank']);
  });
});
