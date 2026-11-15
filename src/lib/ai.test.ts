import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { EXERCISES, ROUTINES, getExercise } from '../data/library';
import { load, reducer } from '../state/store';
import type { Routine, Workout } from '../types';
import { catalogueText, historyText, stableContext, todayContext } from './aiContext';
import { checkPlan, type AiPlan } from './aiValidate';
import { AiError, costUsd, finish, toAiError } from './claude';
import { rehabState } from './rehab';
import { toggleSet, workoutFromRoutine } from './workout';

const now = new Date(Date.UTC(2026, 10, 14, 12));
const byId = (id: string) => ROUTINES.find((r) => r.id === id)!;

function did(r: Routine, daysAgo: number, station?: string): Workout {
  const at = new Date(now.getTime() - daysAgo * 86400000);
  let w = workoutFromRoutine(r, [], getExercise, at);
  for (const b of w.blocks) for (const i of b.items) i.sets.forEach((_, k) => (w = toggleSet(w, i.id, k)));
  if (station) w.blocks[0].items[0].station = station;
  return { ...w, finishedAt: new Date(at.getTime() + 40 * 60000).toISOString() };
}

const item = (exerciseId: string, sets = 3, reps: number | null = 10, weight: number | null = null) => ({
  exerciseId,
  sets,
  reps,
  seconds: null,
  weight,
});

describe('cost', () => {
  it('prices Haiku and Sonnet tokens, cache reads included', () => {
    expect(costUsd('haiku', { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.6);
    expect(costUsd('sonnet', { input: 0, output: 100_000, cacheRead: 1_000_000, cacheWrite: 0 })).toBeCloseTo(1.1);
  });

  it('adds every call to the running total until reset', () => {
    let s = load();
    s = reducer(s, { type: 'aiUsage', model: 'haiku', usage: { input: 2000, output: 500, cacheRead: 6000, cacheWrite: 0 } });
    s = reducer(s, { type: 'aiUsage', model: 'haiku', usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 } });
    expect(s.ai.spent).toMatchObject({ calls: 2, input: 9000, output: 1000 });
    expect(s.ai.spent.usd).toBeCloseTo((3000 * 0.1 + 1000 * 0.5 + 6000 * 0.01) / 1e6);
    s = reducer(s, { type: 'aiUsageReset', now: '2026-11-15T08:00:00Z' });
    expect(s.ai.spent).toMatchObject({ calls: 0, usd: 0, since: '2026-11-15T08:00:00Z' });
  });

  it('keeps the key out of the routines and history it syncs', () => {
    const s = reducer(load(), { type: 'aiSettings', ai: { key: 'sk-ant-test', askModel: 'sonnet' } });
    expect(s.ai).toMatchObject({ key: 'sk-ant-test', askModel: 'sonnet' });
    expect(s.sync.queue).toEqual([]);
  });
});

describe('reading replies', () => {
  const reply = (stop: string, text: string) =>
    ({
      stop_reason: stop,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: null },
    }) as unknown as Anthropic.Message;

  it('parses the JSON and reports tokens', () => {
    expect(finish(reply('end_turn', '{"a":1}'), 'haiku')).toEqual({
      data: { a: 1 },
      usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 0 },
      model: 'haiku',
    });
  });

  it('turns refusals, cut-offs and junk into errors that still carry the cost', () => {
    for (const [stop, text, kind] of [
      ['refusal', '', 'refused'],
      ['max_tokens', '{"a":', 'cutoff'],
      ['end_turn', 'not json', 'bad'],
    ]) {
      try {
        finish(reply(stop, text), 'haiku');
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AiError);
        expect((e as AiError).kind).toBe(kind);
        expect((e as AiError).usage?.input).toBe(10);
      }
    }
  });
});

describe('errors', () => {
  it('maps API statuses to messages fit for the screen', () => {
    const http = (status: number) => Object.assign(new Error('x'), { status });
    expect(toAiError(http(401)).kind).toBe('auth');
    expect(toAiError(http(429)).kind).toBe('rate');
    expect(toAiError(http(529)).kind).toBe('busy');
    expect(toAiError(http(400)).kind).toBe('bad');
    expect(toAiError(new Error('fetch failed')).message).toMatch(/Couldn't reach Claude/);
  });
});

describe('context', () => {
  it('lists every exercise once, with its type and muscles', () => {
    const lines = catalogueText(EXERCISES).split('\n');
    expect(lines).toHaveLength(EXERCISES.length);
    expect(lines.find((l) => l.startsWith('arnold-press |'))).toMatch(/\| weight \| Dumbbells \| .*frontDelts/);
    const stable = stableContext(EXERCISES);
    expect(stable).toMatch(/rotator cuff/);
    // big enough to be cached (Haiku needs 512+ tokens; ~4 characters a token)
    expect(stable.length).toBeGreaterThan(4000);
  });

  it('summarises recent sessions per exercise, with stations and notes', () => {
    const w = did(byId('upper-a'), 2, 'Upstairs 1');
    w.blocks[0].items[0].note = 'felt heavy';
    const text = historyText([w, did(byId('upper-a'), 5)], getExercise, now);
    const first = w.blocks[0].items[0].exerciseId;
    expect(text).toMatch(new RegExp(`^${first} ×2 — last 2026-11-12: .*station Upstairs 1 · note: "felt heavy"`, 'm'));
    expect(text).toMatch(/2026-11-12 Upper A \(40 min\)/);
    expect(historyText([did(byId('upper-a'), 40)], getExercise, now)).toMatch(/No workouts/);
  });

  it('includes rehab, the muscles that are behind, and the routines', () => {
    const text = todayContext({
      history: [did(byId('upper-a'), 1)],
      routines: ROUTINES,
      rehab: rehabState([], ROUTINES),
      lookup: getExercise,
      now,
    });
    expect(text).toMatch(/^TODAY: Saturday 2026-11-14/);
    expect(text).toMatch(/hamstring rehab in progress: phase 1/);
    expect(text).toMatch(/upper-b "Upper B"/);
    expect(text).not.toMatch(/hamstring-rehab-1 "/); // phase routines are the rehab card's business
    const load = text.split('MUSCLE LOAD')[1].split('ROUTINES')[0];
    expect(load.indexOf('chest')).toBeGreaterThan(load.indexOf('calves')); // lowest first
  });
});

describe('checking a plan', () => {
  const rehab = rehabState([], ROUTINES);
  const opts = { lookup: getExercise, rehab, routines: ROUTINES, source: byId('upper-a') };

  it('drops unknown exercises and leg work during rehab, and says so', () => {
    const plan: AiPlan = {
      name: 'Shoulders',
      blocks: [
        { superset: true, items: [item('arnold-press'), item('made-up-press')] },
        { superset: false, items: [item('leg-press')] },
      ],
    };
    const { blocks, dropped } = checkPlan(plan, opts);
    expect(dropped).toEqual([
      'Dropped "made-up-press": not an exercise in the app',
      'Dropped Leg press: legs wait for the hamstring rehab',
    ]);
    // a superset left with one exercise becomes a plain block; the rehab dose stays at the end
    expect(blocks[0]).toEqual({ items: [{ exerciseId: 'arnold-press', sets: 3, reps: 10 }] });
    expect(blocks[blocks.length - 1].rehabDose).toBe('hamstring');
    expect(blocks).toHaveLength(2);
  });

  it('allows leg work once there is no rehab, with no dose block', () => {
    const { blocks, dropped } = checkPlan(
      { name: 'Legs', blocks: [{ superset: false, items: [item('leg-press')] }] },
      { ...opts, rehab: null },
    );
    expect(dropped).toEqual([]);
    expect(blocks).toEqual([{ items: [{ exerciseId: 'leg-press', sets: 3, reps: 10 }] }]);
  });

  it('keeps numbers sane and uses seconds for timed exercises', () => {
    const plan: AiPlan = {
      name: 'x',
      blocks: [
        {
          superset: true,
          items: [item('lateral-raise', 40, 400, 7.3), { exerciseId: 'plank', sets: 3, reps: 45, seconds: null, weight: null }],
        },
      ],
    };
    const [b] = checkPlan(plan, { ...opts, rehab: null }).blocks;
    expect(b.superset).toBe(true);
    expect(b.items[0]).toEqual({ exerciseId: 'lateral-raise', sets: 10, reps: 50, weight: 7.25 });
    expect(b.items[1]).toEqual({ exerciseId: 'plank', sets: 3, seconds: 45 });
  });

  it("doesn't repeat the dose exercises or an exercise twice", () => {
    const dose = byId('upper-a').blocks.find((b) => b.rehabDose)!;
    const plan: AiPlan = {
      name: 'x',
      blocks: [{ superset: false, items: [item('face-pull'), item(dose.items[0].exerciseId), item('face-pull')] }],
    };
    const { blocks, dropped } = checkPlan(plan, opts);
    expect(blocks.map((b) => b.items.map((i) => i.exerciseId))).toEqual([['face-pull'], dose.items.map((i) => i.exerciseId)]);
    expect(dropped).toEqual(['Dropped a second Face pull']);
  });
});
