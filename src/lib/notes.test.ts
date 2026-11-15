import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import type { Workout } from '../types';
import {
  applySuggestion,
  dismissSuggestion,
  findItem,
  notePrompt,
  addItemNote,
  addNote,
  addReply,
  removeItemNote,
  removeNote,
  threadOf,
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
  it('keeps a note as a chat: each message adds a line, a reply marks it read, deleting the last removes it', () => {
    let w = start();
    const id = w.blocks[0].items[0].id;
    w = addItemNote(w, id, '  shoulder\n twinge  ', 't1');
    expect(findItem(w, id)).toMatchObject({ note: 'shoulder twinge', noteThread: [{ from: 'me', text: 'shoulder twinge', at: 't1' }] });
    expect(unreadNote(findItem(w, id)!)).toBe(true);
    expect(addItemNote(w, id, '  ', 't')).toEqual(w);
    const pain = { kind: 'pain' as const, pain: 2, label: 'Pain 2/10' };
    w = {
      ...w,
      blocks: w.blocks.map((b) => ({ ...b, items: b.items.map((i) => (i.id === id ? addReply(i, 1, ' Which set? ', [pain], 't2') : i)) })),
    };
    expect(unreadNote(findItem(w, id)!)).toBe(false);
    w = addItemNote(w, id, 'set 3, sharp', 't3');
    const item = findItem(w, id)!;
    expect(item.note).toBe('shoulder twinge\nset 3, sharp');
    expect(threadOf(item).map((m) => m.from)).toEqual(['me', 'claude', 'me']);
    expect(unreadNote(item)).toBe(true);
    // a reply to the first two only goes before the newer message; a newer pain chip replaces the old one
    const late = addReply(item, 2, '', [{ ...pain, pain: 6, label: 'Pain 6/10' }], 't4');
    expect(threadOf(late).map((m) => m.from)).toEqual(['me', 'claude', 'claude', 'me']);
    expect(unreadNote(late)).toBe(true);
    expect(late.noteSuggestions).toEqual([{ ...pain, pain: 6, label: 'Pain 6/10' }]);
    // the prompt shows the chat so far and only the new message as the note
    const p = notePrompt(item, getExercise(item.exerciseId)!, false);
    expect(p).toMatch(/Earlier in this note:\nStefan: shoulder twinge\nYou: Which set\?/);
    expect(p).toMatch(/Note: """set 3, sharp"""/);
    expect(p).toMatch(/waiting for his tap: Pain 2\/10/);
    // deleting
    expect(removeItemNote(w, id, 1)).toEqual(w); // Claude's messages stay
    const one = removeItemNote(w, id, 0);
    expect(findItem(one, id)!.note).toBe('set 3, sharp');
    const none = removeItemNote(one, id, 1);
    expect(findItem(none, id)).not.toHaveProperty('note');
    expect(findItem(none, id)).not.toHaveProperty('noteThread');
    expect(findItem(none, id)).not.toHaveProperty('noteSuggestions');
    // session notes
    const s = addNote(addNote(w, ' slept badly ', 'a'), 'legs fine', 'b');
    expect(s.note).toBe('slept badly\nlegs fine');
    expect(removeNote(removeNote(s, 0), 0)).not.toHaveProperty('note');
  });

  it('reads notes written before threads', () => {
    const item = { ...start().blocks[0].items[0], note: 'old note' };
    expect(threadOf(item)).toEqual([{ from: 'me', text: 'old note', at: '' }]);
    expect(unreadNote(item)).toBe(true);
    expect(unreadNote({ ...item, noteSuggestions: [] })).toBe(false);
    const next = addNote({ ...item, noteSuggestions: [] }, 'new one', 't');
    expect(next.note).toBe('old note\nnew one');
    expect(unreadNote(next as typeof item)).toBe(true);
  });

  it('asks only for what the note says, with what is logged', () => {
    const w0 = start();
    const w = addItemNote(w0, w0.blocks[0].items[0].id, 'used upstairs 2', 't');
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
    w = addItemNote(w, item.id, 'x', 't');
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
