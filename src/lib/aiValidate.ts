import type { Exercise, Routine, RoutineBlock, RoutineItem } from '../types';
import { heldBack } from './aiContext';
import type { RehabState } from './rehab';

type Lookup = (id: string) => Exercise | undefined;

/** A workout plan as Claude writes it (structured output: every field present, null when unused). */
export interface AiItem {
  exerciseId: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  weight: number | null;
}
export interface AiBlock {
  superset: boolean;
  items: AiItem[];
}
export interface AiPlan {
  name: string;
  blocks: AiBlock[];
}

/** JSON schema for AiPlan (structured outputs need additionalProperties: false and no min/max). */
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'blocks'],
  properties: {
    name: { type: 'string', description: 'Short workout name, e.g. "Shoulders + arms"' },
    blocks: {
      type: 'array',
      description: 'In order. A superset block has 2–3 items done back to back.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['superset', 'items'],
        properties: {
          superset: { type: 'boolean' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['exerciseId', 'sets', 'reps', 'seconds', 'weight'],
              properties: {
                exerciseId: { type: 'string', description: 'An id from the catalogue' },
                sets: { type: 'integer' },
                reps: { type: ['integer', 'null'], description: 'null for timed exercises' },
                seconds: { type: ['integer', 'null'], description: 'Only for timed exercises' },
                weight: { type: ['number', 'null'], description: 'kg; null = use what was lifted last time' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface Checked {
  blocks: RoutineBlock[];
  /** What the app changed or removed, for the screen ("Dropped leg-press: legs wait for the hamstring rehab"). */
  dropped: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, step: number) => Math.round(x / step) * step;

function cleanItem(raw: AiItem, ex: Exercise): RoutineItem {
  const item: RoutineItem = { exerciseId: ex.id, sets: clamp(Math.round(raw.sets || ex.defaults.sets || 3), 1, 10) };
  if (ex.type === 'timed') {
    item.seconds = clamp(Math.round(raw.seconds ?? raw.reps ?? ex.defaults.seconds ?? 30), 5, 600);
  } else {
    const reps = raw.reps ?? ex.defaults.reps;
    if (reps !== undefined) item.reps = clamp(Math.round(reps), 1, 50);
  }
  if (raw.weight !== null && raw.weight !== undefined && Number.isFinite(raw.weight) && raw.weight > 0) {
    item.weight = clamp(round(raw.weight, ex.type === 'machine' ? 0.5 : 0.25), 0, 400);
  }
  return item;
}

/** The rehab dose block to keep in a plan: the source routine's, else any routine's. */
function doseBlock(rehab: RehabState | null, source: Routine | undefined, routines: Routine[]): RoutineBlock | undefined {
  if (!rehab || rehab.done) return undefined;
  const own = source?.blocks.find((b) => b.rehabDose === rehab.area);
  if (own) return own;
  for (const r of routines) {
    if (r.archived) continue;
    const b = r.blocks.find((x) => x.rehabDose === rehab.area);
    if (b) return b;
  }
  return undefined;
}

/**
 * Checks a plan in code before Stefan sees it: unknown exercises and (during rehab) leg work are dropped and
 * reported; sets, reps, seconds and weights are kept sane; supersets need two exercises; the rehab dose block stays.
 */
export function checkPlan(
  plan: AiPlan,
  opts: { lookup: Lookup; rehab: RehabState | null; routines: Routine[]; source?: Routine },
): Checked {
  const { lookup, rehab, routines, source } = opts;
  const dropped: string[] = [];
  const dose = doseBlock(rehab, source, routines);
  // the dose block covers these (and follows the rehab phase); don't do them twice
  const seen = new Set<string>(dose?.items.map((i) => i.exerciseId));
  const blocks: RoutineBlock[] = [];
  for (const b of plan.blocks ?? []) {
    const items: RoutineItem[] = [];
    for (const raw of b.items ?? []) {
      const ex = lookup(raw.exerciseId);
      if (!ex) {
        dropped.push(`Dropped "${raw.exerciseId}": not an exercise in the app`);
        continue;
      }
      if (seen.has(ex.id)) {
        if (!dose?.items.some((i) => i.exerciseId === ex.id)) dropped.push(`Dropped a second ${ex.name}`);
        continue;
      }
      const why = heldBack(ex, rehab);
      if (why) {
        dropped.push(`Dropped ${ex.name}: ${why}`);
        continue;
      }
      seen.add(ex.id);
      items.push(cleanItem(raw, ex));
    }
    if (!items.length) continue;
    blocks.push(b.superset && items.length > 1 ? { superset: true, items } : { items });
  }
  return { blocks: dose ? [...blocks, dose] : blocks, dropped };
}
