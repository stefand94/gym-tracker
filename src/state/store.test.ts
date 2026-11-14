import { describe, expect, it } from 'vitest';
import { EXERCISES, ROUTINES, allExercises, getExercise, setCustomExercises } from '../data/library';
import { mergeForPush, mergeVersioned } from '../lib/merge';
import { routineIdFromPath } from '../lib/sync';
import type { Exercise, Routine } from '../types';
import { CUSTOM_ID, isPending, load, reducer, type QueueOp, type State } from './store';

const NOW = '2026-11-15T10:00:00.000Z';
const routine = (id: string, updatedAt?: string, name = id): Routine => ({ id, name, blocks: [], updatedAt });
const custom = (id: string, updatedAt?: string, name = id): Exercise => ({
  id,
  name,
  type: 'weight',
  equipment: 'Cable',
  primary: [],
  secondary: [],
  defaults: { sets: 3, reps: 10 },
  custom: true,
  updatedAt,
});

function fresh(): State {
  return { ...load(), routines: [], customExercises: [] };
}

describe('initial state', () => {
  it('seeds bundled routines with an old timestamp so remote copies win', () => {
    const s = load();
    expect(s.routines.map((r) => r.id)).toEqual(ROUTINES.map((r) => r.id));
    expect(s.routines.every((r) => r.updatedAt! < '2001')).toBe(true);
  });
});

describe('mergeVersioned', () => {
  it('takes remote copies unless a pending local one is at least as new', () => {
    const local = [routine('a', '2026-11-10'), routine('b', '2026-11-12', 'local b'), routine('c', '2026-11-12', 'local c')];
    const remote = [routine('a', '2026-11-01', 'remote a'), routine('b', '2026-11-11', 'remote b'), routine('c', '2026-11-13', 'remote c'), routine('d')];
    const pending = (id: string) => id === 'b' || id === 'c';
    const out = Object.fromEntries(mergeVersioned(local, remote, pending).map((r) => [r.id, r.name]));
    // a: not pending → remote even though older (Claude may have forgotten to bump updatedAt)
    expect(out).toEqual({ a: 'remote a', b: 'local b', c: 'remote c', d: 'd' });
  });

  it('mergeForPush keeps remote edits and remote-only entries', () => {
    const remote = [custom('x', '2026-11-14', 'reviewed by Claude'), custom('y', '2026-11-01')];
    const local = [custom('x', '2026-11-13', 'quick entry'), custom('z', '2026-11-15')];
    expect(mergeForPush(remote, local).map((e) => e.name)).toEqual(['reviewed by Claude', 'y', 'z']);
  });
});

describe('queue', () => {
  it('treats legacy ops without kind as workouts', () => {
    const legacy: QueueOp = { op: 'put', id: 'push' };
    expect(isPending([legacy], 'workout', 'push')).toBe(true);
    expect(isPending([legacy], 'routine', 'push')).toBe(false);
  });

  it('a routine and a workout with the same id queue separately', () => {
    let s: State = { ...fresh(), sync: { queue: [{ op: 'put', id: 'push' }], busy: false } };
    s = reducer(s, { type: 'routineSave', routine: routine('push'), now: NOW });
    expect(s.sync.queue.map((q) => q.kind ?? 'workout')).toEqual(['workout', 'routine']);
  });

  it('an edit made while syncing survives the sync finishing', () => {
    let s = reducer(fresh(), { type: 'routineSave', routine: routine('a'), now: NOW });
    const inFlight = [...s.sync.queue];
    s = reducer(s, { type: 'routineSave', routine: routine('a', undefined, 'edited'), now: '2026-11-15T10:01:00.000Z' });
    s = reducer(s, { type: 'syncDone', completed: inFlight, at: NOW });
    expect(isPending(s.sync.queue, 'routine', 'a')).toBe(true);
  });
});

describe('reducer', () => {
  it('routineSave stamps updatedAt and archive keeps the routine', () => {
    let s = reducer(fresh(), { type: 'routineSave', routine: routine('a'), now: NOW });
    expect(s.routines[0].updatedAt).toBe(NOW);
    s = reducer(s, { type: 'routineArchive', id: 'a', now: '2026-11-16T00:00:00.000Z' });
    expect(s.routines).toHaveLength(1);
    expect(s.routines[0].archived).toBe(true);
  });

  it('exerciseSave marks custom and queues the one custom file', () => {
    let s = reducer(fresh(), { type: 'exerciseSave', exercise: custom('x'), now: NOW });
    s = reducer(s, { type: 'exerciseSave', exercise: custom('y'), now: NOW });
    expect(s.customExercises.map((e) => [e.id, e.custom, e.updatedAt])).toEqual([
      ['x', true, NOW],
      ['y', true, NOW],
    ]);
    expect(s.sync.queue).toHaveLength(1);
    expect(isPending(s.sync.queue, 'customExercises', CUSTOM_ID)).toBe(true);
  });

  it('remoteMerge after the sync finished takes the pushed copy and records shas', () => {
    let s = reducer(fresh(), { type: 'routineSave', routine: routine('a', undefined, 'mine'), now: NOW });
    s = reducer(s, { type: 'syncDone', completed: s.sync.queue, at: NOW });
    s = reducer(s, {
      type: 'remoteMerge',
      remote: { routines: [routine('a', NOW, 'from repo')], shas: { 'routines/a.json': 'abc' } },
    });
    expect(s.routines[0].name).toBe('from repo');
    expect(s.remoteShas).toEqual({ 'routines/a.json': 'abc' });
  });
});

describe('exercise lookup', () => {
  it('finds custom exercises, but bundled ones win on the same id', () => {
    const bundled = EXERCISES[0];
    setCustomExercises([custom('my-cable-thing'), custom(bundled.id, undefined, 'shadow')]);
    expect(getExercise('my-cable-thing')?.name).toBe('my-cable-thing');
    expect(getExercise(bundled.id)?.name).toBe(bundled.name);
    expect(allExercises()).toHaveLength(EXERCISES.length + 1);
    setCustomExercises([]);
  });

  it('parses routine paths', () => {
    expect(routineIdFromPath('routines/upper-a.json')).toBe('upper-a');
    expect(routineIdFromPath('workouts/2026/2026-11-14-x.json')).toBeNull();
  });
});
