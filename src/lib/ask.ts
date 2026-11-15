import type { Lookup, Routine, RoutineBlock, Workout } from '../types';
import { routinesText } from './aiContext';
import { checkPlan, PLAN_SCHEMA, type AiPlan } from './aiValidate';
import type { RehabState } from './rehab';

export type AskKind = 'change' | 'today' | 'new' | 'answer';

/** Where Ask was opened, so Claude knows what "this" means. */
export type AskFrom =
  { kind: 'home' } | { kind: 'routine'; routine: Omit<Routine, 'id'> & { id?: string } } | { kind: 'workout'; workout: Workout };

export const ASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'reason', 'answer', 'routineId', 'plan'],
  properties: {
    kind: { type: 'string', enum: ['change', 'today', 'new', 'answer'] },
    reason: { type: 'string', description: 'One line on why, with a number from his data where possible' },
    answer: { type: 'string', description: '1–3 short sentences to Stefan; may be empty when the plan speaks for itself' },
    routineId: { type: ['string', 'null'], description: 'kind change: the id of the routine being changed' },
    plan: PLAN_SCHEMA,
  },
} as const;

export interface RawAnswer {
  kind: AskKind;
  reason: string;
  answer: string;
  routineId: string | null;
  plan: AiPlan;
}

/** What Stefan has open right now, in words. */
function whereText(from: AskFrom, lookup: Lookup): string {
  if (from.kind === 'home') return 'He asked from the home screen.';
  if (from.kind === 'routine') {
    const r = { id: from.routine.id ?? 'new-routine', ...from.routine } as Routine;
    return `He asked from the routine editor, with this routine open (unsaved edits included):\n${routinesText([r], lookup)}\n"This routine" means this one${
      from.routine.id ? ` (routineId ${from.routine.id})` : ' (not saved yet: use kind new)'
    }.`;
  }
  const w = from.workout;
  const lines = w.blocks.map((b, n) => {
    const items = b.items.map((i) => {
      const name = lookup(i.exerciseId)?.name ?? i.exerciseId;
      const done = i.sets.filter((s) => s.done).length;
      const state = i.status === 'skipped' ? 'skipped' : `${done}/${i.sets.length} sets done`;
      return `${i.exerciseId} (${name}) ${state}${i.station ? ` [${i.station}]` : ''}${i.note ? ` note: "${i.note}"` : ''}`;
    });
    return `  ${n + 1}. ${b.superset ? 'superset: ' : ''}${items.join(b.superset ? ' + ' : ', ')}`;
  });
  const mins = Math.round((Date.now() - new Date(w.startedAt).getTime()) / 60000);
  return [
    `He asked in the middle of his workout "${w.name}"${w.routineId ? ` (from routine ${w.routineId})` : ''}, ${mins} min in:`,
    ...lines,
    w.note ? `Session note: "${w.note}"` : '',
    'A "today" plan is added to the end of this workout, so only include what is still to do.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** One question and what came of it, for the chat so far. */
export interface AskTurn {
  q: string;
  result?: AskResult;
}

/** The chat so far, short: his questions, and your kind, reason, words and plan (ids only). */
function chatText(turns: AskTurn[]): string {
  return turns
    .filter((t) => t.result)
    .slice(-6)
    .map((t) => {
      const r = t.result!;
      const plan = r.blocks
        .filter((b) => !b.rehabDose)
        .map((b) => b.items.map((i) => i.exerciseId).join(' + '))
        .join(', ');
      const you = [
        `kind ${r.kind}${r.routine ? ` of ${r.routine.id}` : ''}`,
        r.reason,
        r.answer,
        plan ? `plan "${r.name}": ${plan}` : '',
      ].filter(Boolean);
      return `Stefan: """${t.q.trim()}"""\nYou: ${you.join(' · ')}`;
    })
    .join('\n');
}

export function askPrompt(question: string, from: AskFrom, lookup: Lookup, earlier: AskTurn[] = []): string {
  const chat = chatText(earlier);
  return [
    ...(chat ? [`This is a follow-up. The chat so far (oldest first):\n${chat}`, ''] : []),
    `Stefan asks: """${question.trim()}"""`,
    ...(chat ? ['"It", "that" and "this" may mean your last answer: build on it rather than starting over.'] : []),
    '',
    whereText(from, lookup),
    '',
    'Answer with one kind:',
    '- change: rework one of his existing routines. Set routineId and give the whole new routine in plan, every block in order.',
    '- today: a one-off workout to do now ("today", "short on time", "right now"). Give it in plan.',
    '- new: a new routine to save, with a good short name.',
    '- answer: just answer the question; plan has no blocks.',
    'reason: one line on why, with a number from his data where you can (e.g. "Side delts at 2 of 10 sets this week").',
    'Plans: follow his rules; only catalogue ids; reps null for timed exercises; weight null unless you mean to change it',
    '(the app fills in what he lifted last time); leave out the rehab dose block (the app adds it).',
    'For supersets on "the same machine or weights", pair exercises that share equipment, station or the weights he logged.',
  ].join('\n');
}

export interface AskResult {
  kind: AskKind;
  reason: string;
  answer: string;
  name: string;
  blocks: RoutineBlock[];
  dropped: string[];
  /** kind change: the routine as it is now. */
  routine?: Routine;
}

/** Checks Claude's answer: a known routine for a change, a plan that passes checkPlan, else just the words. */
export function readAnswer(
  raw: RawAnswer,
  ctx: { from: AskFrom; routines: Routine[]; rehab: RehabState | null; lookup: Lookup },
): AskResult {
  const { from } = ctx;
  const live = ctx.routines.filter((r) => !r.archived && !r.rehab);
  const openId = from.kind === 'routine' ? from.routine.id : from.kind === 'workout' ? from.workout.routineId : undefined;
  let kind = raw.kind;
  let routine = kind === 'change' ? live.find((r) => r.id === raw.routineId) : undefined;
  // "change this routine" from the editor, even when the id came back wrong
  if (kind === 'change' && !routine && from.kind === 'routine') routine = live.find((r) => r.id === openId);
  if (kind === 'change' && !routine) kind = 'new';
  const source = routine ?? live.find((r) => r.id === openId);
  const checked =
    kind === 'answer'
      ? { blocks: [], dropped: [] }
      : checkPlan(raw.plan, { lookup: ctx.lookup, rehab: ctx.rehab, routines: ctx.routines, source });
  // a plan that's only the rehab dose (or nothing) isn't a plan
  const real = checked.blocks.some((b) => !b.rehabDose);
  return {
    kind: real ? kind : 'answer',
    reason: (raw.reason ?? '').trim(),
    answer: (raw.answer ?? '').trim() || (!real && kind !== 'answer' ? 'Claude’s plan had nothing the app could use.' : ''),
    name: (raw.plan?.name ?? '').trim().slice(0, 40) || routine?.name || 'Claude’s workout',
    blocks: real ? checked.blocks : [],
    dropped: checked.dropped,
    routine: real && kind === 'change' ? routine : undefined,
  };
}

/** Blocks for a workout that's already going: leave out a second rehab dose. */
export function blocksToAppend(blocks: RoutineBlock[], w: Workout): RoutineBlock[] {
  const hasDose = w.blocks.some((b) => b.rehabDose);
  return hasDose ? blocks.filter((b) => !b.rehabDose) : blocks;
}

/** Example questions shown as chips. */
export const EXAMPLES = [
  'I want more shoulders — restructure my workout',
  'Short on time: supersets on the same machine or weights',
  'What’s underworked? Build a workout around it',
];
