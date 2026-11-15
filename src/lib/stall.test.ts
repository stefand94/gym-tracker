import { describe, expect, it } from 'vitest';
import { getExercise } from '../data/library';
import type { Routine, SetEntry, Workout, WorkoutItem } from '../types';
import { stallFrom, stallText, stuckExercises, targetReps, tracksStalls } from './stall';
import { changeReps, dismissStall, makeItem, repSchemes, resetSets, resetStalled, routineWithScheme } from './workout';

const ex = (id: string) => getExercise(id)!;
const sets = (weight: number, ...reps: number[]): SetEntry[] => reps.map((r) => ({ weight, reps: r, done: true }));
const bench = 'barbell-bench-press';

let day = 1;
function done(exerciseId: string, s: SetEntry[], extra: Partial<WorkoutItem> = {}): Workout {
  const t = new Date(Date.UTC(2026, 9, day++, 9)).toISOString();
  return {
    id: `w${day}`,
    name: 'W',
    startedAt: t,
    finishedAt: t,
    blocks: [{ id: 'b', superset: false, items: [{ id: `i${day}`, exerciseId, status: 'done', sets: s, ...extra }] }],
  };
}
const wrap = (item: WorkoutItem): Workout => ({ id: 'x', name: 'x', startedAt: '', blocks: [{ id: 'b', superset: false, items: [item] }] });

describe('stall detection', () => {
  it('flags four sessions in a row that never beat the best before them', () => {
    const best = done(bench, sets(60, 8, 8, 7));
    const flat = [1, 2, 3, 4].map(() => done(bench, sets(60, 8, 7, 7)));
    expect(stallFrom(ex(bench), [best, ...flat.slice(0, 3)])).toBeNull(); // only three so far
    expect(stallFrom(ex(bench), [best, ...flat], undefined, 8)).toEqual({ kind: 'flat', sessions: 4, target: 8 });
    const better = done(bench, sets(62.5, 8, 7, 7));
    expect(stallFrom(ex(bench), [best, ...flat, better])).toBeNull();
  });

  it('flags reps missed two sessions running at the same weight, once there are four sessions', () => {
    const a = done(bench, sets(55, 8, 8, 8));
    const b = done(bench, sets(57.5, 8, 8, 8));
    const c = done(bench, sets(60, 8, 7, 6));
    const d = done(bench, sets(60, 8, 7, 6));
    expect(stallFrom(ex(bench), [b, c, d], undefined, 8)).toBeNull();
    expect(stallFrom(ex(bench), [a, b, c, d], undefined, 8)).toEqual({ kind: 'missed', sessions: 2, weight: 60, target: 8 });
    expect(stallFrom(ex(bench), [a, b, c, d], undefined, 6)).toBeNull(); // hit a lower target
    expect(stallText({ kind: 'missed', sessions: 2, weight: 60 })).toBe('reps missed 2 sessions running at 60 kg');
  });

  it('counts from the last fix, keeps stations apart, and leaves pain-tracked work alone', () => {
    const before = [done(bench, sets(60, 9)), ...[1, 2, 3, 4].map(() => done(bench, sets(60, 8)))];
    expect(stallFrom(ex(bench), before)).not.toBeNull();
    const reset = done(bench, sets(52.5, 8), { stallFix: 'reset' });
    expect(stallFrom(ex(bench), [...before, reset, done(bench, sets(55, 8)), done(bench, sets(57.5, 8))])).toBeNull();
    const pain = [1, 2, 3, 4, 5].map(() => done(bench, sets(60, 8), { trackPain: true, pain: 2 }));
    expect(stallFrom(ex(bench), pain)).toBeNull();
    const row = 'seated-cable-row';
    const up = [1, 2, 3, 4, 5].map(() => done(row, sets(40, 10), { station: 'Upstairs 1' }));
    const down = [done(row, sets(30, 10), { station: 'Downstairs' }), done(row, sets(32.5, 10), { station: 'Downstairs' })];
    expect(stallFrom(ex(row), [...up, ...down], 'Upstairs 1')).toMatchObject({ kind: 'flat', sessions: 4 });
    expect(stallFrom(ex(row), [...up, ...down], 'Downstairs')).toBeNull();
  });

  it('counts less help as progress on assisted machines, and skips carries, sleds, jumps and intervals', () => {
    const a = 'assisted-pull-up';
    const less = [30, 25, 25, 20, 20].map((kg) => done(a, sets(kg, 8)));
    expect(stallFrom(ex(a), less)).toBeNull();
    const same = [30, 30, 30, 30, 30].map((kg) => done(a, sets(kg, 8)));
    expect(stallFrom(ex(a), same)).toMatchObject({ kind: 'flat' });
    for (const id of ['farmer-carry', 'sled-push', 'box-jump', 'jog-interval', 'medicine-ball-rotational-throw'])
      expect(tracksStalls(ex(id))).toBe(false);
  });

  it('is carried by the workout item, and go-up wins over it', () => {
    const flat = [done(bench, sets(60, 9, 9, 9)), ...[1, 2, 3, 4].map(() => done(bench, sets(60, 8, 8, 8)))];
    expect(makeItem(ex(bench), flat, { exerciseId: bench, sets: 3, reps: 10 }).stall).toMatchObject({ kind: 'flat', sessions: 4 });
    const item = makeItem(ex(bench), flat, { exerciseId: bench, sets: 3, reps: 8 });
    expect(item.goUp).toBe(2.5);
    expect(item.stall).toBeUndefined();
    expect(makeItem(ex(bench), flat, { exerciseId: bench, sets: 3, reps: 10, trackPain: true }).stall).toBeUndefined();
  });

  it('lists what is stuck now, using the reps the routine aims for', () => {
    const routines: Routine[] = [{ id: 'r', name: 'R', blocks: [{ items: [{ exerciseId: bench, reps: 10 }] }] }];
    expect(targetReps(ex(bench), routines)).toBe(10);
    const hist = [done(bench, sets(60, 9)), ...[1, 2, 3, 4].map(() => done(bench, sets(60, 8)))];
    const now = new Date(hist[hist.length - 1].startedAt);
    expect(stuckExercises(hist, routines, getExercise, now).map((s) => s.ex.id)).toEqual([bench]);
  });
});

describe('stall fixes', () => {
  const stuck = (id: string, s: SetEntry[], target = 8): WorkoutItem => ({
    id: 'i',
    exerciseId: id,
    status: 'pending',
    sets: s.map((x) => ({ ...x, done: false })),
    stall: { kind: 'flat', sessions: 4, target },
  });

  it('reset drops about 10% to a real step, more help on assisted machines', () => {
    expect(resetSets(ex(bench), stuck(bench, sets(60, 8, 7, 6))).map((s) => [s.weight, s.reps])).toEqual([
      [52.5, 8],
      [52.5, 8],
      [52.5, 8],
    ]);
    expect(resetSets(ex('dumbbell-bench-press'), stuck('dumbbell-bench-press', sets(20, 8)))[0].weight).toBe(18);
    expect(resetSets(ex('assisted-pull-up'), stuck('assisted-pull-up', sets(30, 8)))[0].weight).toBe(35);
    const w = resetStalled(wrap(stuck(bench, sets(60, 8, 8))), 'i', getExercise).blocks[0].items[0];
    expect(w.stall).toBeUndefined();
    expect(w.stallFix).toBe('reset');
  });

  it('offers the two other rep ranges at the matching weight, and saves the pick to the routine', () => {
    const item = stuck(bench, sets(60, 8, 8, 8));
    const schemes = repSchemes(ex(bench), item);
    expect(schemes).toEqual([
      { sets: 4, reps: 5, weight: 65 },
      { sets: 3, reps: 12, weight: 52.5 },
    ]);
    expect(repSchemes(ex('assisted-pull-up'), stuck('assisted-pull-up', sets(30, 8)))).toEqual([]);
    const w = changeReps(wrap(item), 'i', schemes[0], getExercise).blocks[0].items[0];
    expect(w.sets.map((s) => [s.weight, s.reps])).toEqual([
      [65, 5],
      [65, 5],
      [65, 5],
      [65, 5],
    ]);
    expect(w.stallFix).toBe('reps');
    const r: Routine = {
      id: 'r',
      name: 'R',
      blocks: [{ items: [{ exerciseId: 'lateral-raise' }, { exerciseId: bench, sets: 3, reps: 8 }] }],
    };
    expect(routineWithScheme(r, bench, schemes[0])?.blocks[0].items[1]).toEqual({ exerciseId: bench, sets: 4, reps: 5 });
    expect(routineWithScheme(r, 'barbell-curl', schemes[0])).toBeNull();
    expect(dismissStall(wrap(item), 'i').blocks[0].items[0].stall).toBeUndefined();
  });
});
