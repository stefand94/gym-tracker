import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import type { Exercise, Routine, RoutineBlock, Workout } from '../types';
import { exerciseGroup } from './groups';
import { loadSince } from './muscleLoad';
import { finishedNewestFirst } from './prefill';
import type { RehabState } from './rehab';

type Lookup = (id: string) => Exercise | undefined;

/** Weighted sets per 7 days a muscle wants (same as suggest.ts). */
export const WEEK_TARGET = 10;

/** Stefan's standing rules: Claude must follow them, and aiValidate.ts enforces what code can check. */
export const RULES = [
  'Weights are kg. Dumbbell exercises are per dumbbell; barbell is total bar weight; assisted machines are kg of assistance (less = harder).',
  'Trains 3–4 times a week. Weekday sessions must fit in 45 minutes (about 5 blocks; supersets save time). Weekends can be longer.',
  'Go easy on the rotator cuff: no upright rows, no behind-the-neck pressing, keep dips shallow; external rotations are good.',
  'While the hamstring rehab is unfinished: no leg exercises at all outside the rehab dose block (the app also removes them).',
  'Shoulders are a focus Stefan wants more of.',
  'Equipment he likes: barbells, dumbbells, cable stations (leverage differs between stations, so keep the station tag), and the functional area: kettlebells from 8 kg up (none lighter), a sled, plyo boxes and wall balls.',
  'Prefers free weights and cables over machines. The only machines worth programming: leg press (tolerated), leg curl and leg extension (wanted).',
];

const n = (x: number) => (Math.round(x * 10) / 10).toString();

/** One line per exercise: id, name, type, equipment, primary / secondary muscles. */
export function catalogueText(list: Exercise[]): string {
  return list
    .map((e) => {
      const s = e.secondary.length ? ` / ${e.secondary.join(',')}` : '';
      return `${e.id} | ${e.name} | ${e.type} | ${e.equipment} | ${e.primary.join(',')}${s}`;
    })
    .join('\n');
}

/** The part of the system prompt that stays the same between calls (so it caches). */
export function stableContext(exercises: Exercise[]): string {
  return [
    "You are the coach inside Stefan's personal gym tracker app. Be brief and practical, like a good PT talking between sets.",
    '',
    "STEFAN'S RULES",
    ...RULES.map((r) => `- ${r}`),
    '',
    'EXERCISE CATALOGUE (only these ids exist; never invent ids)',
    'id | name | type | equipment | primary muscles / secondary muscles',
    'Types: weight = kg × reps; machine = kg × reps (5 kg steps); bodyweight = reps (+ optional added kg); timed = seconds.',
    catalogueText(exercises),
    '',
    `Muscle ids: ${MUSCLE_IDS.join(', ')}.`,
  ].join('\n');
}

function blockText(b: RoutineBlock, lookup: Lookup): string {
  const items = b.items.map((i) => {
    const ex = lookup(i.exerciseId);
    const amount = i.seconds ? `${i.seconds}s` : i.reps ? `${i.reps}` : '';
    const dose = [
      i.sets ? `${i.sets}×${amount}` : amount,
      i.weight !== undefined ? `@${i.weight}kg` : '',
      i.station ? `[${i.station}]` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `${i.exerciseId}${ex ? '' : ' (unknown)'}${dose ? ` ${dose}` : ''}`;
  });
  if (b.rehabDose) return `rehab dose block (${b.rehabDose}; filled with the current phase): ${items.join(', ')}`;
  return (b.superset && items.length > 1 ? 'superset: ' : '') + items.join(b.superset ? ' + ' : ', ');
}

export function routinesText(routines: Routine[], lookup: Lookup): string {
  return routines
    .filter((r) => !r.archived && !r.rehab)
    .map((r) => {
      const blocks = r.blocks.map((b, i) => `  ${i + 1}. ${blockText(b, lookup)}`).join('\n');
      return `${r.id} "${r.name}"${r.description ? ` — ${r.description}` : ''}\n${blocks}`;
    })
    .join('\n');
}

const day = (iso: string) => iso.slice(0, 10);

/** Per exercise done in the last `days`: times done, last date, last sets (weight × reps), station. */
export function historyText(history: Workout[], lookup: Lookup, now = new Date(), days = 28): string {
  const cutoff = now.getTime() - days * 86400000;
  const recent = finishedNewestFirst(history).filter((w) => new Date(w.startedAt).getTime() >= cutoff);
  if (!recent.length) return `No workouts logged in the last ${days} days.`;
  const sessions = recent.map((w) => {
    const mins = w.finishedAt ? Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60000) : 0;
    const names = w.blocks
      .flatMap((b) => b.items)
      .filter((i) => i.status !== 'skipped' && i.sets.some((s) => s.done))
      .map((i) => lookup(i.exerciseId)?.name ?? i.exerciseId);
    const note = w.note ? ` · note: "${w.note}"` : '';
    return `${day(w.startedAt)} ${w.name} (${mins} min): ${names.join(', ')}${note}`;
  });
  const seen = new Map<string, { times: number; line: string }>();
  for (const w of recent) {
    for (const i of w.blocks.flatMap((b) => b.items)) {
      const done = i.sets.filter((s) => s.done);
      if (i.status === 'skipped' || !done.length) continue;
      const prev = seen.get(i.exerciseId);
      if (prev) {
        prev.times++;
        continue;
      }
      const sets = done
        .map((s) => (s.seconds !== undefined ? `${s.seconds}s` : `${s.weight !== undefined ? `${n(s.weight)}kg×` : ''}${s.reps ?? ''}`))
        .join(', ');
      const extra = [
        i.station ? `station ${i.station}` : '',
        i.pain !== undefined ? `pain ${i.pain}/10` : '',
        i.note ? `note: "${i.note}"` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      seen.set(i.exerciseId, { times: 1, line: `last ${day(w.startedAt)}: ${sets}${extra ? ` · ${extra}` : ''}` });
    }
  }
  const per = [...seen].map(([id, v]) => `${id} ×${v.times} — ${v.line}`);
  return [`Sessions (newest first):`, ...sessions, '', `Per exercise (last ${days} days):`, ...per].join('\n');
}

/** Weighted sets per muscle over 7 days vs the target, and over 48 h (fatigue). Lowest first. */
export function loadText(history: Workout[], lookup: Lookup, now = new Date()): string {
  const week = loadSince(history, 7, lookup, now);
  const recent = loadSince(history, 2, lookup, now);
  const rows = (MUSCLE_IDS.filter((m) => m !== 'neck') as MuscleId[])
    .sort((a, b) => week[a] - week[b])
    .map((m) => `${m} (${MUSCLE_LABELS[m]}): ${n(week[m])}/${WEEK_TARGET} this week, ${n(recent[m])} in 48 h`);
  return rows.join('\n');
}

export function rehabText(r: RehabState | null): string {
  if (!r) return 'No rehab going on.';
  if (r.done) return `${r.area} rehab finished: leg work is allowed again; keep the small Nordic dose.`;
  return `${r.area} rehab in progress: phase ${r.phase} of ${r.maxPhase}, ${r.streak} good session(s) in a row${
    r.ready ? ', ready to move up' : ''
  }${r.dropBack ? ', dropping back a phase' : ''}. No leg exercises outside the rehab dose block.`;
}

export interface ContextInput {
  history: Workout[];
  routines: Routine[];
  rehab: RehabState | null;
  lookup: Lookup;
  now?: Date;
}

/** The part of the system prompt built from today's data. */
export function todayContext({ history, routines, rehab, lookup, now = new Date() }: ContextInput): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  return [
    `TODAY: ${weekday} ${day(now.toISOString())}`,
    '',
    'REHAB',
    rehabText(rehab),
    '',
    `MUSCLE LOAD (weighted sets: primary 1, secondary 0.5; target ${WEEK_TARGET} a week)`,
    loadText(history, lookup, now),
    '',
    'ROUTINES (id "name", blocks in order)',
    routinesText(routines, lookup),
    '',
    'HISTORY',
    historyText(history, lookup, now),
  ].join('\n');
}

/** Exercises Claude must not put in a plan right now (leg work during rehab). */
export function heldBack(ex: Exercise, rehab: RehabState | null): string | null {
  if (rehab && !rehab.done && exerciseGroup(ex) === 'legs') return `legs wait for the ${rehab.area} rehab`;
  return null;
}
