import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import type { Workout } from '../types';
import {
  applySuggestion,
  dismissSuggestion,
  findItem,
  notePrompt,
  setItemNote,
  setWorkoutNote,
  swapInRoutine,
  toSuggestions,
  unreadNote,
  type RawSuggestion,
} from './notes';
import { workoutFromRoutine } from './workout';

const upperA = ROUTINES.find((r) => r.id === 'upper-a')!;
const start = (): Workout => workoutFromRoutine(upperA, [], getExercise, new Date(Date.UTC(2026, 10, 14, 12)));
const raw = (r: Partial<RawSuggestion>): RawSuggestion => ({
  kind: 'pain',
  label: '',
  pain: null,
  station: null,
  sets: [],
  exerciseId: null,
  ...r,
});

describe('notes', () => {
  it('saves a note, and an edit drops suggestions read from the old text', () => {
    let w = start();
    const id = w.blocks[0].items[0].id;
    w = setItemNote(w, id, '  shoulder twinge  ');
    expect(findItem(w, id)!.note).toBe('shoulder twinge');
    expect(unreadNote(findItem(w, id)!)).toBe(true);
    w = { ...w, blocks: w.blocks.map((b) => ({ ...b, items: b.items.map((i) => (i.id === id ? { ...i, noteSuggestions: [] } : i)) })) };
    expect(unreadNote(findItem(w, id)!)).toBe(false);
    expect(setItemNote(w, id, 'shoulder twinge')).toEqual(w); // unchanged text: still read
    const edited = setItemNote(w, id, 'shoulder twinge, sharp on set 3');
    expect(findItem(edited, id)!.noteSuggestions).toBeUndefined();
    expect(findItem(setItemNote(edited, id, ' '), id)!.note).toBeUndefined();
    expect(setWorkoutNote(w, ' slept badly ').note).toBe('slept badly');
    expect('note' in setWorkoutNote({ ...w, note: 'x' }, '')).toBe(false);
  });

  it('asks only for what the note says, with what is logged', () => {
    const w0 = start();
    const w = setItemNote(w0, w0.blocks[0].items[0].id, 'used upstairs 2');
    const item = w.blocks[0].items[0];
    const p = notePrompt(item, getExercise(item.exerciseId)!, true);
    expect(p).toMatch(/Note: """used upstairs 2"""/);
    expect(p).toMatch(/set 1 /);
    expect(p).toMatch(/swap:/);
    expect(notePrompt(item, getExercise(item.exerciseId)!, false)).toMatch(/no swaps/);
  });

  it('keeps only suggestions that make sense', () => {
    const item = start().blocks[0].items[0];
    const ex = getExercise(item.exerciseId)!;
    const out = toSuggestions(
      [
        raw({ kind: 'pain', pain: 14, label: 'Pain' }),
        raw({ kind: 'station', station: '  Upstairs 2 ' }),
        raw({
          kind: 'sets',
          sets: [
            { weight: 20, reps: 8, seconds: null },
            { weight: null, reps: null, seconds: null },
          ],
        }),
        raw({ kind: 'sets', sets: [{ weight: 20, reps: 8.4, seconds: null }] }),
        raw({ kind: 'swap', exerciseId: 'made-up' }),
        raw({ kind: 'swap', exerciseId: 'face-pull' }),
        raw({ kind: 'pain', pain: null }),
      ],
      item,
      ex,
      getExercise,
      true,
    );
    expect(out).toEqual([
      { kind: 'pain', pain: 10, label: 'Pain' },
      { kind: 'station', station: 'Upstairs 2', label: 'Station Upstairs 2' },
      { kind: 'sets', sets: [{ weight: 20, reps: 8 }], label: '20 kg × 8' },
      { kind: 'swap', exerciseId: 'face-pull', label: 'Next time: Face pull' },
    ]);
    expect(toSuggestions([raw({ kind: 'swap', exerciseId: 'face-pull' })], item, ex, getExercise, false)).toEqual([]);
  });

  it('applies a suggestion to the log and removes it; dismissing just removes it', () => {
    let w = start();
    const item = w.blocks[0].items[0];
    w = setItemNote(w, item.id, 'x');
    const suggestions = [
      { kind: 'pain' as const, pain: 3, label: 'Pain 3/10' },
      { kind: 'sets' as const, sets: [{ weight: 22.5, reps: 6 }], label: '22.5 × 6' },
      { kind: 'station' as const, station: 'Upstairs 2', label: 'Upstairs 2' },
    ];
    w = {
      ...w,
      blocks: w.blocks.map((b) => ({ ...b, items: b.items.map((i) => (i.id === item.id ? { ...i, noteSuggestions: suggestions } : i)) })),
    };
    w = applySuggestion(w, item.id, 0, [], getExercise);
    expect(findItem(w, item.id)).toMatchObject({ pain: 3, trackPain: true, note: 'x' });
    w = applySuggestion(w, item.id, 0, [], getExercise);
    const after = findItem(w, item.id)!;
    expect(after.sets).toEqual([{ weight: 22.5, reps: 6, done: true }]);
    expect(after.status).toBe('done');
    w = dismissSuggestion(w, item.id, 0);
    expect(findItem(w, item.id)!.noteSuggestions).toEqual([]);
    expect(findItem(w, item.id)!.station).toBeUndefined();
  });

  it('swaps an exercise in the routine for next time, keeping sets and reps', () => {
    const first = upperA.blocks[0].items[0];
    const next = swapInRoutine(upperA, first.exerciseId, 'landmine-press', getExercise)!;
    expect(next.blocks[0].items[0]).toMatchObject({ exerciseId: 'landmine-press', sets: first.sets });
    expect(next.blocks[0].items[0].weight).toBeUndefined();
    expect(swapInRoutine(upperA, 'not-in-it', 'landmine-press', getExercise)).toBeNull();
  });
});
