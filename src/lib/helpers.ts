import { isMuscleId, MUSCLE_IDS, type MuscleId } from '../data/muscles';
import type { Exercise, ExerciseDefaults, ExerciseType, HowTo, Lookup, Workout } from '../types';
import { finishedNewestFirst } from './prefill';

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const TYPES: ExerciseType[] = ['weight', 'machine', 'bodyweight', 'timed'];

// ---- Auto-fill a new custom exercise ----

export const FILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'equipment', 'primary', 'secondary', 'cue', 'weightNote', 'sets', 'reps', 'seconds', 'steps', 'mistake'],
  properties: {
    type: { type: 'string', enum: TYPES },
    equipment: {
      type: 'string',
      description: 'Cable, Dumbbells, Barbell, Machine, Bodyweight, EZ bar, Smith machine, Kettlebell, Band or Other',
    },
    primary: { type: 'array', items: { type: 'string', enum: MUSCLE_IDS } },
    secondary: { type: 'array', items: { type: 'string', enum: MUSCLE_IDS } },
    cue: { type: 'string', description: 'One short coaching cue, under 8 words' },
    weightNote: { type: 'string', description: 'How the weight is entered, e.g. "per dumbbell"; empty if obvious' },
    sets: { type: 'integer' },
    reps: { type: ['integer', 'null'] },
    seconds: { type: ['integer', 'null'], description: 'timed only' },
    steps: { type: 'array', items: { type: 'string' }, description: '3–4 short steps, in your own words' },
    mistake: { type: 'string', description: 'The most common mistake, one sentence' },
  },
} as const;

export interface RawFill {
  type: ExerciseType;
  equipment: string;
  primary: string[];
  secondary: string[];
  cue: string;
  weightNote: string;
  sets: number;
  reps: number | null;
  seconds: number | null;
  steps: string[];
  mistake: string;
}

export function fillPrompt(name: string, current: { type: ExerciseType; equipment: string }): string {
  return [
    `Stefan is adding his own exercise called "${name.trim()}".`,
    `He has it as type ${current.type}${current.equipment ? `, ${current.equipment}` : ''} so far (a guess from the name; correct it if wrong).`,
    'Fill in the details the way the catalogue does. Types: weight (free weights, kg × reps), machine (pin-stack machine or cable, kg × reps),',
    'bodyweight (reps, optional added kg), timed (seconds). Primary muscles do most of the work (1–3); secondary help.',
    'If an exercise in the catalogue is the same movement, copy its muscles. Defaults: a sensible starting sets and reps (or seconds).',
  ].join('\n');
}

export interface Fill {
  type: ExerciseType;
  equipment: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  cue?: string;
  weightNote?: string;
  defaults: ExerciseDefaults;
  howto?: HowTo;
}

const muscles = (xs: unknown, not: MuscleId[] = []): MuscleId[] =>
  Array.isArray(xs)
    ? [...new Set(xs.filter((m): m is MuscleId => typeof m === 'string' && isMuscleId(m) && !not.includes(m)))].slice(0, 4)
    : [];

/** Claude's fill, checked: known muscles only, a muscle is never both, sane defaults. */
export function readFill(raw: RawFill): Fill {
  const type = TYPES.includes(raw.type) ? raw.type : 'weight';
  const primary = muscles(raw.primary);
  const secondary = muscles(raw.secondary, primary);
  const sets = Math.min(6, Math.max(1, Math.round(Number(raw.sets) || 3)));
  const defaults: ExerciseDefaults =
    type === 'timed'
      ? { sets, seconds: Math.min(300, Math.max(10, Math.round(Number(raw.seconds) || 30))) }
      : { sets, reps: Math.min(30, Math.max(1, Math.round(Number(raw.reps) || 10))) };
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s) => str(s, 160))
    .filter(Boolean)
    .slice(0, 5);
  const mistake = str(raw.mistake, 200);
  const cue = str(raw.cue, 60);
  const weightNote = str(raw.weightNote, 40);
  return {
    type,
    equipment: str(raw.equipment, 30) || 'Other',
    primary,
    secondary,
    defaults,
    ...(cue ? { cue } : {}),
    ...(weightNote ? { weightNote } : {}),
    ...(steps.length ? { howto: { steps, ...(mistake ? { mistake } : {}) } } : {}),
  };
}

// ---- Picker: "Ask Claude" when search finds nothing ----

export const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ids', 'note'],
  properties: {
    ids: { type: 'array', items: { type: 'string' }, description: 'Up to 3 catalogue ids, best first; empty if none fit' },
    note: { type: 'string', description: 'One short line, e.g. "Gyms call this a pec deck" or "Not in the catalogue yet"' },
  },
} as const;

export interface RawFind {
  ids: string[];
  note: string;
}

export function findPrompt(query: string): string {
  return [
    `Stefan searched the exercise list for "${query.trim()}" and nothing matched by name.`,
    'Which catalogue exercises does he most likely mean? Gym slang, misspellings and machine brand names count.',
    'Only return ids that really are that movement (or a very close equivalent). If nothing fits, return none.',
  ].join('\n');
}

export function readFind(raw: RawFind, lookup: Lookup): { matches: Exercise[]; note: string } {
  const seen = new Set<string>();
  const matches = (Array.isArray(raw.ids) ? raw.ids : [])
    .map((id) => lookup(id))
    .filter((e): e is Exercise => !!e && !seen.has(e.id) && !!seen.add(e.id))
    .slice(0, 3);
  return { matches, note: str(raw.note, 120) };
}

// ---- Weekly check-in on Home ----

export const CHECKIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'wins', 'behind', 'rehab', 'next'],
  properties: {
    headline: { type: 'string', description: 'The week in under 10 words' },
    wins: { type: 'array', items: { type: 'string' }, description: '0–3 lifts that went up, with the numbers' },
    behind: { type: 'array', items: { type: 'string' }, description: '0–3 muscles under target, with sets done of target' },
    rehab: { type: 'string', description: 'One line on the rehab, empty if none' },
    next: { type: 'string', description: 'One concrete thing for the next session, mentioning his notes if they matter' },
  },
} as const;

export interface RawCheckIn {
  headline: string;
  wins: string[];
  behind: string[];
  rehab: string;
  next: string;
}

export interface CheckIn extends RawCheckIn {
  /** Monday of the week it covers, YYYY-MM-DD (local). */
  week: string;
  at: string;
  /** Finished workouts it was based on (a new one makes it stale). */
  workouts: number;
}

const pad = (x: number) => String(x).padStart(2, '0');

/** Monday of `now`'s week, local time. */
export function weekKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Finished workouts in the last 7 days: what a check-in is based on. */
export const weekWorkouts = (history: Workout[], now = new Date()) =>
  finishedNewestFirst(history).filter((w) => now.getTime() - new Date(w.startedAt).getTime() < 7 * 864e5).length;

export const checkInPrompt = () =>
  [
    "Write Stefan's weekly check-in from the last 7 days of his data (MUSCLE LOAD, HISTORY with his notes, REHAB, STUCK).",
    'Be specific and short: numbers from his log, no filler, no praise words like "great job". Lists may be empty.',
    `"behind" uses the weekly target of sets per muscle. "next" is one thing to do next session, following his rules.`,
    'If STUCK lists an exercise, put it in "behind", with the reason from his notes on those sessions when they give one.',
  ].join('\n');

export function readCheckIn(raw: RawCheckIn, meta: Pick<CheckIn, 'week' | 'at' | 'workouts'>): CheckIn {
  const list = (xs: unknown) =>
    Array.isArray(xs)
      ? xs
          .map((x) => str(x, 120))
          .filter(Boolean)
          .slice(0, 3)
      : [];
  return {
    headline: str(raw.headline, 80) || 'Your week',
    wins: list(raw.wins),
    behind: list(raw.behind),
    rehab: str(raw.rehab, 160),
    next: str(raw.next, 200),
    ...meta,
  };
}

/** Whether Home should fetch a new check-in on its own: none for this week yet, and something to say. */
export function checkInDue(c: CheckIn | undefined, history: Workout[], now = new Date()): boolean {
  return c?.week !== weekKey(now) && weekWorkouts(history, now) > 0;
}

/** A newer workout has been finished since this check-in was written. */
export const checkInStale = (c: CheckIn, history: Workout[], now = new Date()) => weekWorkouts(history, now) > c.workouts;
