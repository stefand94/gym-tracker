import { describe, expect, it } from 'vitest';
import { ROUTINES, getExercise } from '../data/library';
import { askPrompt, blocksToAppend, readAnswer, type AskFrom, type RawAnswer } from './ask';
import type { AiItem } from './aiValidate';
import { rehabState } from './rehab';
import { workoutFromRoutine } from './workout';

const rehab = rehabState([], ROUTINES);
const it3 = (exerciseId: string): AiItem => ({ exerciseId, sets: 3, reps: 12, seconds: null, weight: null });
const answer = (a: Partial<RawAnswer>): RawAnswer => ({
  kind: 'today',
  reason: 'Side delts at 2 of 10 sets this week',
  answer: '',
  routineId: null,
  plan: { name: 'Shoulders', blocks: [{ superset: true, items: [it3('lateral-raise'), it3('face-pull')] }] },
  ...a,
});
const ctx = (from: AskFrom = { kind: 'home' }) => ({ from, routines: ROUTINES, rehab, lookup: getExercise });

describe('Ask', () => {
  it('reads a change to a known routine, keeping its rehab dose', () => {
    const r = readAnswer(answer({ kind: 'change', routineId: 'upper-a' }), ctx());
    expect(r.kind).toBe('change');
    expect(r.routine?.id).toBe('upper-a');
    expect(r.blocks[0]).toMatchObject({ superset: true, items: [{ exerciseId: 'lateral-raise' }, { exerciseId: 'face-pull' }] });
    expect(r.blocks[r.blocks.length - 1].rehabDose).toBe('hamstring');
    expect(r.reason).toMatch(/Side delts/);
  });

  it('treats a change to a routine that does not exist as a new one, unless asked from its editor', () => {
    expect(readAnswer(answer({ kind: 'change', routineId: 'nope' }), ctx()).kind).toBe('new');
    const fromEditor = ctx({ kind: 'routine', routine: { ...ROUTINES.find((x) => x.id === 'upper-b')! } });
    expect(readAnswer(answer({ kind: 'change', routineId: 'nope' }), fromEditor).routine?.id).toBe('upper-b');
  });

  it('falls back to just the words when nothing in the plan is usable', () => {
    const r = readAnswer(answer({ plan: { name: 'Legs', blocks: [{ superset: false, items: [it3('leg-press')] }] } }), ctx());
    expect(r.kind).toBe('answer');
    expect(r.blocks).toEqual([]);
    expect(r.dropped[0]).toMatch(/Leg press: legs wait/);
    expect(r.answer).toMatch(/nothing the app could use/);
    const q = readAnswer(answer({ kind: 'answer', answer: 'Side delts and rear delts.', plan: { name: '', blocks: [] } }), ctx());
    expect(q).toMatchObject({ kind: 'answer', answer: 'Side delts and rear delts.', blocks: [] });
  });

  it('tells Claude what is open: the workout so far, or the routine being edited', () => {
    const w = workoutFromRoutine(
      ROUTINES.find((x) => x.id === 'upper-a')!,
      [],
      getExercise,
    );
    const p = askPrompt('short on time', { kind: 'workout', workout: w }, getExercise);
    expect(p).toMatch(/Stefan asks: """short on time"""/);
    expect(p).toMatch(/middle of his workout "Upper A" \(from routine upper-a\)/);
    expect(p).toMatch(/0\/\d sets done/);
    const e = askPrompt(
      'more shoulders',
      { kind: 'routine', routine: { name: 'Mine', blocks: [{ items: [{ exerciseId: 'arnold-press' }] }] } },
      getExercise,
    );
    expect(e).toMatch(/not saved yet: use kind new/);
    expect(e).toMatch(/arnold-press/);
  });

  it("doesn't add a second rehab dose to a workout that has one", () => {
    const w = workoutFromRoutine(
      ROUTINES.find((x) => x.id === 'upper-a')!,
      [],
      getExercise,
    );
    const r = readAnswer(answer({}), ctx({ kind: 'workout', workout: w }));
    expect(r.blocks.some((b) => b.rehabDose)).toBe(true);
    expect(blocksToAppend(r.blocks, w).some((b) => b.rehabDose)).toBe(false);
  });
});
