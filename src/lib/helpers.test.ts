import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import { load, reducer } from '../state/store';
import type { Workout } from '../types';
import { checkInDue, checkInStale, readCheckIn, readFill, readFind, weekKey, type RawFill } from './helpers';
import { workoutFromRoutine } from './workout';

const fill = (f: Partial<RawFill>): RawFill => ({
  type: 'machine',
  equipment: 'Machine',
  primary: ['quads'],
  secondary: ['glutes'],
  cue: 'knees track over toes',
  weightNote: '',
  sets: 3,
  reps: 10,
  seconds: null,
  steps: ['Set the pad', 'Lower slowly', 'Drive up'],
  mistake: 'Knees cave in.',
  ...f,
});

const finished = (iso: string): Workout => ({
  ...workoutFromRoutine(
    ROUTINES.find((r) => r.id === 'upper-a')!,
    [],
    getExercise,
    new Date(iso),
  ),
  finishedAt: iso,
});

describe('Claude helpers', () => {
  it('checks an auto-fill: known muscles only, never both, sane defaults, how-to kept', () => {
    const f = readFill(fill({ primary: ['quads', 'quads', 'nope'], secondary: ['quads', 'glutes'], sets: 40, reps: 0 }));
    expect(f).toMatchObject({ type: 'machine', primary: ['quads'], secondary: ['glutes'], defaults: { sets: 6, reps: 10 } });
    expect(f.howto).toEqual({ steps: ['Set the pad', 'Lower slowly', 'Drive up'], mistake: 'Knees cave in.' });
    expect(f.cue).toBe('knees track over toes');
    expect('weightNote' in f).toBe(false);
    const t = readFill(fill({ type: 'timed', seconds: 2, reps: 12, steps: [] }));
    expect(t.defaults).toEqual({ sets: 3, seconds: 10 });
    expect(t.howto).toBeUndefined();
    expect(readFill(fill({ type: 'bogus' as never, equipment: ' ' })).type).toBe('weight');
  });

  it('keeps only real catalogue matches from a search fallback', () => {
    const r = readFind(
      { ids: ['pec-deck', 'made-up', 'pec-deck', 'face-pull', 'lateral-raise', 'arnold-press'], note: ' Gyms call it a fly machine ' },
      getExercise,
    );
    expect(r.matches.map((e) => e.id)).toEqual(['pec-deck', 'face-pull', 'lateral-raise']);
    expect(r.note).toBe('Gyms call it a fly machine');
  });

  it('writes a check-in once a week, and knows when a newer workout makes it stale', () => {
    const now = new Date(2026, 10, 15, 9); // Sunday 15 Nov 2026
    expect(weekKey(now)).toBe('2026-11-09');
    expect(weekKey(new Date(2026, 10, 16, 9))).toBe('2026-11-16');
    const history = [finished('2026-11-13T18:00:00Z')];
    expect(checkInDue(undefined, [], now)).toBe(false); // nothing to say
    expect(checkInDue(undefined, history, now)).toBe(true);
    const c = readCheckIn(
      { headline: ' Solid week ', wins: ['a', '', 'b', 'c', 'd'], behind: ['Side delts 4 of 10'], rehab: '', next: 'Lateral raises first' },
      { week: weekKey(now), at: now.toISOString(), workouts: 1 },
    );
    expect(c).toMatchObject({ headline: 'Solid week', wins: ['a', 'b', 'c'], behind: ['Side delts 4 of 10'] });
    expect(checkInDue(c, history, now)).toBe(false);
    expect(checkInDue(c, history, new Date(2026, 10, 16, 9))).toBe(true); // new week
    expect(checkInStale(c, history, now)).toBe(false);
    expect(checkInStale(c, [...history, finished('2026-11-15T08:00:00Z')], now)).toBe(true);
  });

  it('keeps the check-in with the AI settings', () => {
    const c = readCheckIn({ headline: 'x', wins: [], behind: [], rehab: '', next: '' }, { week: '2026-11-09', at: '', workouts: 0 });
    const s = reducer(load(), { type: 'aiCheckIn', checkIn: c });
    expect(s.ai.checkIn).toEqual(c);
    expect(s.sync.queue).toEqual([]);
  });
});
