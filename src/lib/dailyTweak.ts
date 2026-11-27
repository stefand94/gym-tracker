/** ✦ Tweak on today's workout: Haiku changes the app's draft the way Stefan asks, and code checks the result. */

import type { Lookup, Routine } from '../types';
import { routinesText } from './aiContext';
import { checkPlan, PLAN_SCHEMA, type AiPlan } from './aiValidate';
import { AVOID_LABELS, type DailyOptions } from './daily';
import type { RehabState } from './rehab';

export const TWEAK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reason', 'plan'],
  properties: {
    reason: { type: 'string', description: 'One short line on what you changed and why' },
    plan: PLAN_SCHEMA,
  },
} as const;

export interface RawTweak {
  reason: string;
  plan: AiPlan;
}

export function tweakPrompt(request: string, draft: Routine, opts: DailyOptions, lookup: Lookup): string {
  const chips = [
    `${opts.minutes} min`,
    opts.focus ? `focus ${AVOID_LABELS[opts.focus].toLowerCase()}` : '',
    opts.avoid?.length ? `avoiding ${opts.avoid.map((a) => AVOID_LABELS[a].toLowerCase()).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return [
    `The app drafted today's workout for Stefan (${chips}) from his muscle load and the exercises he does:`,
    routinesText([{ ...draft, id: 'today' }], lookup),
    '',
    `He asks: """${request.trim()}"""`,
    '',
    'Change the draft the way he asks and keep the rest as it is. Give the whole workout in plan, every block in order.',
    `It must still fit in ${opts.minutes} min: a block of 3 sets takes about 7 min, a superset of two about 10, a heavy barbell lift about 11.`,
    'Only catalogue ids; prefer exercises he has logged (HISTORY). reps null for timed exercises; weight null (the app fills in last time).',
    'Leave out the rehab dose block: the app adds it. No kettlebells, sled, boxes, wall balls or medicine balls unless he asks.',
    'reason: one short line, e.g. "Swapped bench for incline dumbbell press: bench taken".',
  ].join('\n');
}

export interface Tweak {
  request: string;
  reason: string;
  name: string;
  blocks: Routine['blocks'];
  dropped: string[];
}

/** Haiku's plan, checked like any Ask plan; null when nothing usable came back. */
export function readTweak(
  raw: RawTweak,
  request: string,
  ctx: { draft: Routine; routines: Routine[]; rehab: RehabState | null; lookup: Lookup },
): Tweak | null {
  const { blocks, dropped } = checkPlan(raw.plan, { lookup: ctx.lookup, rehab: ctx.rehab, routines: ctx.routines, source: ctx.draft });
  if (!blocks.some((b) => !b.rehabDose)) return null;
  return {
    request: request.trim(),
    reason: (raw.reason ?? '').trim(),
    name: (raw.plan?.name ?? '').trim().slice(0, 40) || ctx.draft.name,
    blocks,
    dropped,
  };
}
