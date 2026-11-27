import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import type { SetEntry, Workout, WorkoutItem } from '../types';
import { recentRecords, recordsIn } from './records';
import { doseItems, rehabState } from './rehab';
import {
  completeHold,
  finishHolds,
  goUpFrom,
  keepLastWeight,
  makeItem,
  nextInterval,
  planSets,
  toggleWarmups,
  updateSetForward,
  warmupSets,
  workoutFromRoutine,
} from './workout';

const ex = (id: string) => getExercise(id)!;
const sets = (weight: number, ...reps: number[]): SetEntry[] => reps.map((r) => ({ weight, reps: r, done: true }));

let day = 1;
function done(items: Omit<WorkoutItem, 'id' | 'status'>[]): Workout {
  const t = new Date(Date.UTC(2026, 9, day++, 9)).toISOString();
  return {
    id: `w${day}`,
    name: 'W',
    startedAt: t,
    finishedAt: t,
    blocks: items.map((i, n) => ({ id: `b${n}`, superset: false, items: [{ ...i, id: `i${n}`, status: 'done' }] })),
  };
}
const wrap = (item: WorkoutItem): Workout => ({ id: 'x', name: 'x', startedAt: '', blocks: [{ id: 'b', superset: false, items: [item] }] });

describe('go-up nudges', () => {
  it('goes up when every set hit the top reps at one weight', () => {
    const bench = ex('barbell-bench-press');
    expect(goUpFrom(bench, sets(60, 8, 8, 8), 8, 3)).toBe(2.5);
    expect(goUpFrom(bench, sets(60, 8, 8, 7), 8, 3)).toBe(0); // missed a rep
    expect(goUpFrom(bench, [...sets(60, 8, 8), ...sets(62.5, 8)], 8, 3)).toBe(0); // mixed weights
    expect(goUpFrom(bench, sets(60, 8, 8), 8, 3)).toBe(0); // fewer sets than planned
    expect(goUpFrom(ex('leg-press'), sets(100, 10, 10, 10), 10, 3)).toBe(5);
  });

  it('takes help away on assisted machines, never below zero', () => {
    const a = ex('assisted-pull-up');
    expect(goUpFrom(a, sets(30, 8, 8, 8), 8, 3)).toBe(-5);
    expect(goUpFrom(a, sets(3, 8, 8, 8), 8, 3)).toBe(-3);
  });

  it('pre-fills the next weight with a goUp, and Keep last weight undoes it', () => {
    const bench = ex('barbell-bench-press');
    const history = [done([{ exerciseId: bench.id, sets: sets(60, 8, 8, 8) }])];
    const p = planSets(bench, history, { exerciseId: bench.id, sets: 3, reps: 8 });
    expect(p.goUp).toBe(2.5);
    expect(p.sets.map((s) => s.weight)).toEqual([62.5, 62.5, 62.5]);
    expect(planSets(bench, history, { exerciseId: bench.id, sets: 3, reps: 8, trackPain: true }).goUp).toBeUndefined();
    const item = makeItem(bench, history, { exerciseId: bench.id, sets: 3, reps: 8 });
    expect(item.goUp).toBe(2.5);
    const kept = keepLastWeight(wrap(item), item.id, history, getExercise).blocks[0].items[0];
    expect(kept.goUp).toBeUndefined();
    expect(kept.sets.map((s) => s.weight)).toEqual([60, 60, 60]);
  });
});

describe('warm-up sets', () => {
  const bench = ex('barbell-bench-press');
  it('ramps from the bar to about 50% and 75%, skipping sets too close together', () => {
    expect(warmupSets(bench, sets(80, 5)).map((s) => [s.weight, s.reps])).toEqual([
      [20, 10],
      [40, 8],
      [60, 5],
    ]);
    expect(warmupSets(bench, sets(50, 5)).map((s) => s.weight)).toEqual([20, 37.5]);
    expect(warmupSets(bench, sets(35, 5))).toEqual([]);
    expect(warmupSets(ex('lateral-raise'), sets(10, 12))).toEqual([]); // not a heavy lift
  });

  it('are added to heavy lifts, kept apart from the working sets, and follow the weight until one is ticked', () => {
    const item = makeItem(bench, [], { exerciseId: bench.id, sets: 3, reps: 5, weight: 80 });
    expect(item.warmups?.map((s) => s.weight)).toEqual([20, 40, 60]);
    expect(item.sets).toHaveLength(3);
    const w = updateSetForward(wrap(item), item.id, 0, { weight: 100 }, getExercise);
    expect(w.blocks[0].items[0].warmups?.map((s) => s.weight)).toEqual([20, 50, 75]);
    const off = toggleWarmups(w, item.id, getExercise).blocks[0].items[0];
    expect(off.warmups).toBeUndefined();
    const curl = makeItem(ex('barbell-curl'), [], { exerciseId: 'barbell-curl', weight: 30 });
    expect(curl.warmups).toBeUndefined();
    expect(toggleWarmups(wrap(curl), curl.id, getExercise).blocks[0].items[0].warmups?.length).toBeGreaterThan(0);
  });
});

describe('personal records', () => {
  const id = 'barbell-bench-press';
  const a = done([{ exerciseId: id, sets: sets(60, 8, 8) }]);
  const b = done([{ exerciseId: id, sets: sets(60, 8, 9) }]);
  const c = done([{ exerciseId: id, sets: sets(55, 8) }]);

  it('the first time only sets the bar; a set that beats it is a record', () => {
    expect(recordsIn(a, [a], getExercise).size).toBe(0);
    expect(recordsIn(b, [a, b], getExercise).get('i0')).toEqual([1]);
    expect(recordsIn(c, [a, b, c], getExercise).size).toBe(0);
    const recent = recentRecords([c, a, b], getExercise);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ workoutId: b.id, exerciseId: id, set: { weight: 60, reps: 9 } });
  });

  it('counts stations apart, and skips carries and assisted machines', () => {
    const row = 'seated-cable-row';
    const up = done([{ exerciseId: row, station: 'Upstairs 1', sets: sets(40, 10) }]);
    const down = done([{ exerciseId: row, station: 'Downstairs', sets: sets(30, 10) }]);
    const down2 = done([{ exerciseId: row, station: 'Downstairs', sets: sets(32.5, 10) }]);
    expect(recordsIn(down, [up, down], getExercise).size).toBe(0); // first time on that station
    expect(recordsIn(down2, [up, down, down2], getExercise).get('i0')).toEqual([0]);
    const ap1 = done([{ exerciseId: 'assisted-pull-up', sets: sets(30, 8) }]);
    const ap2 = done([{ exerciseId: 'assisted-pull-up', sets: sets(30, 10) }]);
    expect(recordsIn(ap2, [ap1, ap2], getExercise).size).toBe(0);
  });
});

describe('back to running (rehab phase 4)', () => {
  const phase4 = ROUTINES.find((r) => r.rehab?.phase === 4)!;

  it('is the last phase', () => {
    expect(rehabState([], ROUTINES)?.maxPhase).toBe(4);
  });

  it('runs walk and jog intervals back to back, then stops', () => {
    const w = workoutFromRoutine(phase4, [], getExercise);
    const [jog, walk] = w.blocks[0].items;
    expect(getExercise(jog.exerciseId)?.intervals).toBe(true);
    expect(nextInterval(w, jog.id, 0, getExercise)).toEqual({ itemId: walk.id, set: 0, seconds: walk.sets[0].seconds });
    expect(nextInterval(w, walk.id, 0, getExercise)).toMatchObject({ itemId: jog.id, set: 1 });
    const last = jog.sets.length - 1;
    expect(nextInterval(w, walk.id, last, getExercise)).toBeNull();
    const after = completeHold(w, walk.id, 0, walk.sets[0].seconds!);
    expect(nextInterval(after, jog.id, 0, getExercise)).toBeNull(); // the next one is already done
    const nordic = w.blocks[1].items[0];
    expect(nextInterval(w, nordic.id, 0, getExercise)).toBeNull();
  });

  it('times each interval from the end of the one before, ticking the ones that ran out while the phone was locked', () => {
    const w = workoutFromRoutine(phase4, [], getExercise);
    const [jog, walk] = w.blocks[0].items;
    const j = jog.sets[0].seconds! * 1000;
    const k = walk.sets[0].seconds! * 1000;
    const hold = { itemId: jog.id, set: 0, goAt: 0, endsAt: j };
    // opened again halfway through the second jog
    const { workout, next, last } = finishHolds(w, hold, j + k + 1000, getExercise);
    const [jog2, walk2] = workout.blocks[0].items;
    expect([jog2.sets[0].done, walk2.sets[0].done, jog2.sets[1].done]).toEqual([true, true, false]);
    expect(next).toEqual({ itemId: jog.id, set: 1, goAt: j + k, endsAt: j + k + jog.sets[1].seconds! * 1000 });
    expect(last).toMatchObject({ itemId: walk.id, set: 0 });
    expect(finishHolds(w, hold, j, getExercise).next).toEqual({ itemId: walk.id, set: 0, goAt: j, endsAt: j + k });
  });

  it('keeps the intervals out of the daily dose in upper sessions', () => {
    const upper = ROUTINES.find((r) => r.blocks.some((b) => b.rehabDose))!;
    const block = upper.blocks.find((b) => b.rehabDose)!;
    const state = { ...rehabState([], ROUTINES)!, phase: 4 };
    const items = doseItems(block, state, ROUTINES, getExercise);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => getExercise(i.exerciseId)?.intervals)).toBe(false);
  });
});

describe('two-sided holds', () => {
  const plank = () => makeItem(ex('side-plank'), []);
  const wk = (item: WorkoutItem): Workout => ({ id: 'w', name: 'W', startedAt: '', blocks: [{ id: 'b', superset: false, items: [item] }] });

  it('plans left and right seconds, from last time when there is one', () => {
    const fresh = plank();
    expect(fresh.sets[0]).toMatchObject({ seconds: 30, secondsR: 30 });
    const last = done([{ exerciseId: 'side-plank', sets: [{ seconds: 40, secondsR: 30, done: true }] }]);
    expect(makeItem(ex('side-plank'), [last]).sets[0]).toMatchObject({ seconds: 40, secondsR: 30 });
    // older logs without a right side: both sides start from the one number
    const old = done([{ exerciseId: 'side-plank', sets: [{ seconds: 35, done: true }] }]);
    expect(makeItem(ex('side-plank'), [old]).sets[0]).toMatchObject({ seconds: 35, secondsR: 35 });
    expect(makeItem(ex('plank'), []).sets[0].secondsR).toBeUndefined();
  });

  it('the left side runs into the right after a switch, and only the right ticks the set', () => {
    const item = { ...plank(), sets: [{ seconds: 20, secondsR: 15, done: false }] };
    const w = wk(item);
    const hold = { itemId: item.id, set: 0, goAt: 0, endsAt: 20_000, side: 'L' as const };
    const mid = finishHolds(w, hold, 21_000, getExercise);
    expect(mid.workout.blocks[0].items[0].sets[0]).toMatchObject({ seconds: 20, done: false });
    expect(mid.next).toEqual({ itemId: item.id, set: 0, goAt: 25_000, endsAt: 40_000, side: 'R' });
    // phone locked through both sides: both logged and the set ticked
    const late = finishHolds(w, hold, 60_000, getExercise);
    expect(late.next).toBeNull();
    // ticked when the right side ran out, not when the app noticed
    expect(late.workout.blocks[0].items[0].sets[0]).toEqual({ seconds: 20, secondsR: 15, done: true, at: new Date(40_000).toISOString() });
    expect(completeHold(w, item.id, 0, 12, 'R').blocks[0].items[0].sets[0]).toMatchObject({ seconds: 20, secondsR: 12, done: true });
  });
});
