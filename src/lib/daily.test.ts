import { describe, expect, it } from 'vitest';
import { EXERCISES, ROUTINES, getExercise } from '../data/library';
import type { Routine, Workout } from '../types';
import { blockMinutes, buildDaily, defaultMinutes, habits, layoutBlocks, planMinutes, type DailyOptions } from './daily';
import { exerciseGroup } from './groups';
import { rehabState } from './rehab';
import { toggleSet, workoutFromRoutine } from './workout';

const now = new Date(Date.UTC(2026, 10, 25, 17)); // a Wednesday
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

/** A finished workout of these blocks with every set ticked. */
function did(blocks: Routine['blocks'], d: number, name = 'Workout'): Workout {
  let w = workoutFromRoutine({ id: 'x', name, blocks }, [], getExercise, daysAgo(d));
  for (const b of w.blocks) for (const i of b.items) i.sets.forEach((_, k) => (w = toggleSet(w, i.id, k)));
  return { ...w, routineId: undefined, finishedAt: new Date(daysAgo(d).getTime() + 3600_000).toISOString() };
}

const one = (id: string, sets = 3) => ({ items: [{ exerciseId: id, sets }] });
const pair = (a: string, b: string) => ({ superset: true, items: [{ exerciseId: a }, { exerciseId: b }] });

/** A couple of weeks of the kind of thing he does: bench, curls, cables, shoulders. */
const habit: Workout[] = [
  did([one('barbell-bench-press', 4), pair('hammer-curl', 'dumbbell-fly'), pair('triceps-rope-pushdown', 'face-pull'), one('plank')], 14),
  did([one('lat-pulldown'), pair('lateral-raise', 'rear-delt-fly'), one('dumbbell-shoulder-press'), one('plank')], 12),
  did([one('barbell-bench-press', 4), pair('hammer-curl', 'dumbbell-fly'), one('seated-cable-row'), one('barbell-curl')], 10),
];

const run = (history: Workout[], opts: Partial<DailyOptions> = {}, routines: Routine[] = ROUTINES) =>
  buildDaily(
    { history, routines, exercises: EXERCISES, lookup: getExercise, rehab: rehabState(history, routines), now },
    { minutes: 45, ...opts },
  );

const ids = (r: Routine) => r.blocks.filter((b) => !b.rehabDose).flatMap((b) => b.items.map((i) => i.exerciseId));

describe('daily workout', () => {
  it('defaults to 45 minutes on weekdays and 60 at weekends', () => {
    expect(defaultMinutes(now)).toBe(45);
    expect(defaultMinutes(new Date(Date.UTC(2026, 10, 28, 12)))).toBe(60);
  });

  it('is built from what he does, with at most one new exercise', () => {
    const p = run(habit);
    const done = new Set(habit.flatMap((w) => w.blocks.flatMap((b) => b.items.map((i) => i.exerciseId))));
    const fresh = ids(p.routine).filter((id) => !done.has(id));
    expect(fresh.length).toBeLessThanOrEqual(1);
    expect(p.newIds).toEqual(fresh);
    expect(ids(p.routine).length).toBeGreaterThanOrEqual(4);
  });

  it('holds leg work back during the rehab and ends with the rehab dose', () => {
    const p = run(habit);
    for (const id of ids(p.routine)) expect(exerciseGroup(getExercise(id)!)).not.toBe('legs');
    expect(p.routine.blocks.at(-1)?.rehabDose).toBe('hamstring');
    // with no rehab going on there's no dose
    const free = run(
      habit,
      {},
      ROUTINES.filter((r) => !r.rehab),
    );
    expect(free.routine.blocks.some((b) => b.rehabDose)).toBe(false);
  });

  it('keeps the rehab dose when every routine with one is archived', () => {
    const archived = ROUTINES.map((r) => (r.rehab ? r : { ...r, archived: true }));
    const p = run(habit, {}, archived);
    expect(p.routine.blocks.at(-1)?.rehabDose).toBe('hamstring');
  });

  it('leaves out functional kit, intervals and grip-only work', () => {
    const p = run(habit, { minutes: 75 });
    for (const id of ids(p.routine)) {
      const ex = getExercise(id)!;
      expect(ex.equipment).not.toMatch(/kettlebell|sled|box|medicine ball|treadmill/i);
      expect(ex.intervals).toBeFalsy();
      expect(ex.primary).not.toEqual(['forearms']);
    }
  });

  it('fits the time it is given', () => {
    for (const minutes of [30, 45, 60, 75]) {
      const p = run(habit, { minutes });
      expect(p.minutes).toBeLessThanOrEqual(minutes + 4);
      expect(p.minutes).toBeGreaterThanOrEqual(minutes - 12);
      expect(Math.round(planMinutes(p.routine.blocks, getExercise))).toBe(p.minutes);
    }
    expect(ids(run(habit, { minutes: 75 }).routine).length).toBeGreaterThan(ids(run(habit, { minutes: 30 }).routine).length);
  });

  it('reuses the supersets he does', () => {
    const h = habits(habit, []);
    const list = ['hammer-curl', 'dumbbell-shoulder-press', 'dumbbell-fly', 'plank', 'side-plank'].map((id) => getExercise(id)!);
    const blocks = layoutBlocks(list, 45, h, habit).map((b) => b.items.map((i) => i.exerciseId).join('+'));
    // hammer curl goes with the fly he always pairs it with, not the press next to it; core pairs with core
    expect(blocks).toEqual(['hammer-curl+dumbbell-fly', 'dumbbell-shoulder-press', 'plank+side-plank']);
    // with an hour, only pairs he already does
    expect(layoutBlocks(list, 60, h, habit).map((b) => b.items.length)).toEqual([2, 1, 1, 1]);
  });

  it('never supersets two exercises for the same main muscle, nor a heavy barbell lift (unless time is short)', () => {
    const p = run(habit, { minutes: 45 });
    for (const b of p.routine.blocks.filter((x) => x.superset && !x.rehabDose)) {
      const [a, c] = b.items.map((i) => getExercise(i.exerciseId)!);
      expect(a.primary.some((m) => c.primary.includes(m))).toBe(false);
      expect(a.warmup || c.warmup).toBeFalsy();
    }
  });

  it('follows a focus and an avoid', () => {
    const shoulders = run(habit, { focus: 'shoulders' });
    const delts = ids(shoulders.routine).filter((id) =>
      getExercise(id)!.primary.some((m) => m === 'frontDelts' || m === 'sideDelts' || m === 'rearDelts'),
    );
    expect(delts.length).toBeGreaterThanOrEqual(2);
    expect(shoulders.reason).toMatch(/^Shoulders focus/);

    const noBar = run(habit, { avoid: ['barbell', 'chest'] });
    for (const id of ids(noBar.routine)) {
      const ex = getExercise(id)!;
      expect(ex.equipment).not.toMatch(/barbell|ez bar/i);
      expect(ex.primary).not.toContain('chest');
    }
  });

  it('leans away from a push-heavy last session', () => {
    const pushDay = did(
      [one('barbell-bench-press', 4), one('incline-dumbbell-press'), one('dumbbell-shoulder-press'), one('triceps-rope-pushdown')],
      1,
      'Push day',
    );
    const p = run([...habit, pushDay]);
    expect(p.reason).toMatch(/leaning pull after Push day/);
    const groups = ids(p.routine).map((id) => exerciseGroup(getExercise(id)!));
    expect(groups.filter((g) => g === 'pull').length).toBeGreaterThan(groups.filter((g) => g === 'push').length);
  });

  it('still fills the time when every muscle has had its sets this week', () => {
    const lots = [0.5, 1.5, 2.5, 3.5].flatMap((d) => [
      did(
        [
          one('barbell-bench-press', 4),
          one('lat-pulldown', 4),
          one('overhead-press', 4),
          one('seated-cable-row', 4),
          one('lateral-raise', 4),
          one('rear-delt-fly', 4),
          one('hammer-curl', 4),
          one('triceps-rope-pushdown', 4),
          one('plank', 4),
          one('side-plank', 4),
        ],
        d,
      ),
    ]);
    const p = run(lots);
    expect(ids(p.routine).length).toBeGreaterThanOrEqual(3);
    expect(p.reason).toMatch(/most rested/);
  });

  it('works out a block’s minutes: supersets save time', () => {
    const apart = blockMinutes(one('lateral-raise'), getExercise) + blockMinutes(one('face-pull'), getExercise);
    const together = blockMinutes(pair('lateral-raise', 'face-pull'), getExercise);
    expect(together).toBeLessThan(apart);
    // a heavy barbell lift takes longer (warm-ups, longer rest)
    expect(blockMinutes(one('barbell-bench-press'), getExercise)).toBeGreaterThan(blockMinutes(one('dumbbell-bench-press'), getExercise));
  });
});
