import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import type { Routine, Workout } from '../types';
import { rehabState } from './rehab';
import { describeChanges, newRoutineId, routineFromWorkout, routineWithWorkout, sameRoutineLayout } from './routineEdit';
import { hasLegWork, suggest } from './suggest';
import { addExercise, addSet, moveInWorkout, removeItem, toggleSet, workoutFromRoutine } from './workout';

const byId = (id: string) => ROUTINES.find((r) => r.id === id)!;
const now = new Date(Date.UTC(2026, 10, 14, 12));
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

/** A finished workout of a routine with every set ticked. */
function did(r: Routine, d: number): Workout {
  let w = workoutFromRoutine(r, [], getExercise, daysAgo(d));
  for (const b of w.blocks) for (const i of b.items) i.sets.forEach((_, k) => (w = toggleSet(w, i.id, k)));
  return { ...w, finishedAt: new Date(daysAgo(d).getTime() + 3600_000).toISOString() };
}

describe('suggest', () => {
  it('keeps leg work back until the rehab is done, and leaves rehab routines to the rehab card', () => {
    const rehab = rehabState([], ROUTINES);
    const s = suggest(ROUTINES, [], getExercise, rehab, now);
    expect(s.some((x) => x.routine.rehab)).toBe(false);
    expect(hasLegWork(byId('legs'), getExercise)).toBe(true);
    expect(hasLegWork(byId('upper-a'), getExercise)).toBe(false); // its hamstring dose doesn't count
    expect(s[s.length - 1]).toMatchObject({ routine: { id: 'legs' }, blocked: 'After hamstring rehab' });
    expect(s.filter((x) => x.blocked)).toHaveLength(1);
    // with no rehab going on, legs is just another option
    expect(suggest(ROUTINES, [], getExercise, null, now).every((x) => !x.blocked)).toBe(true);
  });

  it('suggests the routine whose muscles are furthest behind and rested', () => {
    const rehab = rehabState([], ROUTINES);
    // Upper A yesterday → Upper B's pulling is what's behind
    const s = suggest(ROUTINES, [did(byId('upper-a'), 1)], getExercise, rehab, now);
    expect(s[0].routine.id).toBe('upper-b');
    expect(s[0].reason).toMatch(/lowest this week/);
    // and the other way round
    const t = suggest(ROUTINES, [did(byId('upper-b'), 1)], getExercise, rehab, now);
    expect(t[0].routine.id).toBe('upper-a');
  });

  it('says so when nothing is logged this week', () => {
    const s = suggest(ROUTINES, [did(byId('upper-a'), 9)], getExercise, null, now);
    expect(s[0].reason).toBe('Nothing logged this week yet');
  });
});

describe('routine edits', () => {
  const upperA = byId('upper-a');

  it('makes unique, file-safe ids', () => {
    expect(newRoutineId('Push & Pull!', [])).toBe('push-pull');
    expect(newRoutineId('Upper A', ['upper-a', 'upper-a-2'])).toBe('upper-a-3');
    expect(newRoutineId('💪', [])).toBe('workout');
  });

  it('sees no change when the workout went as planned', () => {
    const w = workoutFromRoutine(upperA, [], getExercise, now);
    const next = routineWithWorkout(upperA, w, [], getExercise);
    expect(sameRoutineLayout(upperA, next)).toBe(true);
  });

  it('takes the new order, supersets and set counts, keeping the rehab dose a dose block', () => {
    let w = workoutFromRoutine(upperA, [], getExercise, now);
    // dead hang to the front, an extra set of bench, plank added, lateral raise + face pull superset dropped
    const hang = w.blocks.flatMap((b) => b.items).find((i) => i.exerciseId === 'dead-hang')!;
    const bench = w.blocks[0].items[0];
    const ss = w.blocks[2];
    w = moveInWorkout(w, [hang.id], { gap: 0 });
    w = addSet(w, bench.id);
    for (const i of ss.items) w = removeItem(w, i.id);
    w = addExercise(w, getExercise('plank')!, []);
    const next = routineWithWorkout(upperA, w, [], getExercise);

    expect(sameRoutineLayout(upperA, next)).toBe(false);
    expect(next.blocks[0].items.map((i) => i.exerciseId)).toEqual(['dead-hang']);
    const benchItem = next.blocks[1].items[0];
    expect(benchItem.exerciseId).toBe('barbell-bench-press');
    expect(benchItem.sets).toBe((upperA.blocks[0].items[0].sets ?? getExercise('barbell-bench-press')!.defaults.sets) + 1);
    expect(next.blocks.flatMap((b) => b.items).some((i) => i.exerciseId === 'face-pull')).toBe(false);
    const dose = next.blocks.filter((b) => b.rehabDose);
    expect(dose).toHaveLength(1);
    expect(dose[0]).toEqual(upperA.blocks.find((b) => b.rehabDose));
    expect(next.blocks[next.blocks.length - 1].items[0].exerciseId).toBe('plank');
    expect(describeChanges(upperA, next, getExercise)).toBe('Adds Plank · drops Lateral raise, Face pull');
  });

  it('saves a workout as a routine without its skipped exercises', () => {
    const w = workoutFromRoutine(upperA, [], getExercise, now);
    const skipped = {
      ...w,
      blocks: w.blocks.map((b, i) => (i === 3 ? { ...b, items: b.items.map((x) => ({ ...x, status: 'skipped' as const })) } : b)),
    };
    const r = routineFromWorkout(skipped, getExercise);
    expect(r.blocks.flatMap((b) => b.items).some((i) => i.exerciseId === 'dead-hang')).toBe(false);
    expect(r.blocks[0]).toMatchObject({
      superset: true,
      items: [{ exerciseId: 'barbell-bench-press' }, { exerciseId: 'lat-pulldown' }],
    });
    expect(r.blocks.filter((b) => b.rehabDose)).toHaveLength(1);
  });
});
