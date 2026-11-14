import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import type { Workout } from '../types';
import { doseItems, morningCheck, rehabState, verdict } from './rehab';
import { setPain, workoutFromRoutine } from './workout';

const routines = ROUTINES;
const phase = (n: number) => routines.find((r) => r.rehab?.phase === n)!;
const upper = routines.find((r) => r.blocks.some((b) => b.rehabDose))!;

let day = 1;
/** A finished session of rehab phase n with the given pain (and optional next-morning pain). */
function session(n: number, pain: number | undefined, next?: number): Workout {
  const start = new Date(Date.UTC(2026, 10, day++, 9));
  let w = workoutFromRoutine(phase(n), [], getExercise, start);
  if (pain !== undefined) w = setPain(w, w.blocks[0].items[0].id, pain);
  return { ...w, finishedAt: new Date(start.getTime() + 3600_000).toISOString(), nextDayPain: next };
}
const hist = (...ws: Workout[]) => [...ws].reverse(); // any order works; newest last here

describe('rehab', () => {
  it('starts on phase 1 with no history', () => {
    const s = rehabState([], routines)!;
    expect(s).toMatchObject({ phase: 1, streak: 0, ready: false, dropBack: false, done: false });
    expect(s.next?.id).toBe(phase(1).id);
  });

  it('verdicts follow the pain rules', () => {
    expect(verdict(session(1, 2))).toBe('good');
    expect(verdict(session(1, 3))).toBe('ok');
    expect(verdict(session(1, 4))).toBe('bad');
    expect(verdict(session(1, 1, 4))).toBe('bad'); // worse next morning
    expect(verdict(session(1, 3, 3))).toBe('ok'); // same next morning
    expect(verdict(session(1, undefined))).toBe('unknown');
  });

  it('is ready to move up after two good sessions in a row', () => {
    const one = rehabState(hist(session(1, 1)), routines)!;
    expect(one).toMatchObject({ streak: 1, ready: false });
    const two = rehabState(hist(session(1, 3), session(1, 1), session(1, 2, 1)), routines)!;
    expect(two).toMatchObject({ phase: 1, streak: 2, ready: true });
    expect(two.next?.id).toBe(phase(2).id);
  });

  it('a not-quite-good session resets the streak', () => {
    const s = rehabState(hist(session(1, 1), session(1, 3)), routines)!;
    expect(s).toMatchObject({ streak: 0, ready: false });
  });

  it('drops back a phase when the latest session went badly', () => {
    const s = rehabState(hist(session(1, 1), session(1, 1), session(2, 5)), routines)!;
    expect(s).toMatchObject({ phase: 2, dropBack: true, ready: false });
    expect(s.next?.id).toBe(phase(1).id);
    // never below phase 1
    expect(rehabState(hist(session(1, 6)), routines)!.dropBack).toBe(false);
  });

  it('is done after passing the last phase', () => {
    const s = rehabState(hist(session(3, 0), session(3, 1)), routines)!;
    expect(s).toMatchObject({ done: true, phase: 4 });
  });

  it('dose blocks follow the current phase', () => {
    const block = upper.blocks.find((b) => b.rehabDose)!;
    expect(doseItems(block, rehabState([], routines), routines)).toBe(block.items);
    const p2 = doseItems(block, rehabState(hist(session(2, 1)), routines), routines);
    expect(p2.map((i) => i.exerciseId)).toEqual(phase(2).blocks.flatMap((b) => b.items).slice(0, 2).map((i) => i.exerciseId));
    expect(p2.every((i) => i.trackPain && (i.sets ?? 0) <= 2)).toBe(true);
    const done = doseItems(block, rehabState(hist(session(3, 0), session(3, 1)), routines), routines);
    expect(done.map((i) => i.exerciseId)).toEqual(['nordic-curl']);
  });

  it('expands the dose when a routine starts', () => {
    const state = rehabState(hist(session(2, 1)), routines);
    const w = workoutFromRoutine(upper, [], getExercise, new Date(), (b) => doseItems(b, state, routines));
    const last = w.blocks[w.blocks.length - 1].items.map((i) => i.exerciseId);
    expect(last).toEqual(phase(2).blocks.flatMap((b) => b.items).slice(0, 2).map((i) => i.exerciseId));
    expect(w.blocks[w.blocks.length - 1].items.every((i) => i.trackPain)).toBe(true);
  });

  it('asks the next morning, once', () => {
    const w = session(1, 1);
    const sameDay = new Date(new Date(w.startedAt).getTime() + 5 * 3600_000);
    const nextDay = new Date(new Date(w.startedAt).getTime() + 24 * 3600_000);
    expect(morningCheck([w], sameDay)).toBeUndefined();
    expect(morningCheck([w], nextDay)?.id).toBe(w.id);
    expect(morningCheck([{ ...w, nextDayPain: null }], nextDay)).toBeUndefined();
    expect(morningCheck([w], new Date(new Date(w.startedAt).getTime() + 5 * 86400_000))).toBeUndefined();
  });
});
