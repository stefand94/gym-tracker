import type { Exercise, NoteSuggestion, Routine, Workout, WorkoutItem } from '../types';
import { deriveStatus, setPain, setStation } from './workout';

type Lookup = (id: string) => Exercise | undefined;

const mapItem = (w: Workout, itemId: string, fn: (i: WorkoutItem) => WorkoutItem): Workout => ({
  ...w,
  blocks: w.blocks.map((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? fn(i) : i)) })),
});

export const findItem = (w: Workout, itemId: string) => w.blocks.flatMap((b) => b.items).find((i) => i.id === itemId);

/** Saves an exercise note. A changed note drops the old suggestions (they were read from the old text). */
export function setItemNote(w: Workout, itemId: string, text: string): Workout {
  const note = text.trim() || undefined;
  return mapItem(w, itemId, (i) => {
    if (i.note === note) return i;
    const { noteSuggestions: _, note: __, ...rest } = i;
    return note ? { ...rest, note } : rest;
  });
}

export function setWorkoutNote(w: Workout, text: string): Workout {
  const note = text.trim() || undefined;
  const { note: _, ...rest } = w;
  return note ? { ...rest, note } : rest;
}

/** Notes that have text but haven't been read by Claude yet (`noteSuggestions` is set, maybe empty, once read). */
export const unreadNote = (i: WorkoutItem) => !!i.note && i.noteSuggestions === undefined;

// ---- What Claude reads out of a note ----

export interface RawSuggestion {
  kind: 'pain' | 'station' | 'sets' | 'swap';
  label: string;
  pain: number | null;
  station: string | null;
  sets: { weight: number | null; reps: number | null; seconds: number | null }[];
  exerciseId: string | null;
}

export const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'pain', 'station', 'sets', 'exerciseId'],
        properties: {
          kind: { type: 'string', enum: ['pain', 'station', 'sets', 'swap'] },
          label: { type: 'string', description: 'What tapping it does, 2–6 words, e.g. "Pain 4/10" or "Last set: 20 kg × 6"' },
          pain: { type: ['integer', 'null'], description: 'kind pain: 0–10' },
          station: { type: ['string', 'null'], description: 'kind station: e.g. "Upstairs 1"' },
          sets: {
            type: 'array',
            description: 'kind sets: what was actually done, one entry per set from set 1 (empty otherwise)',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['weight', 'reps', 'seconds'],
              properties: {
                weight: { type: ['number', 'null'] },
                reps: { type: ['integer', 'null'] },
                seconds: { type: ['integer', 'null'] },
              },
            },
          },
          exerciseId: { type: ['string', 'null'], description: 'kind swap: catalogue id to do instead next time' },
        },
      },
    },
  },
} as const;

const setText = (s: { weight?: number; reps?: number; seconds?: number }) =>
  s.seconds !== undefined ? `${s.seconds}s` : `${s.weight !== undefined ? `${s.weight} kg × ` : ''}${s.reps ?? '?'}`;

export function notePrompt(item: WorkoutItem, ex: Exercise, canSwap: boolean): string {
  return [
    `Stefan wrote a note on "${ex.name}" (${ex.id}, ${ex.type}${ex.weightNote ? `, kg ${ex.weightNote}` : ''}) during his workout.`,
    `Logged so far: ${item.sets.map((s, i) => `set ${i + 1} ${setText(s)}${s.done ? ' ✓' : ''}`).join('; ')}.`,
    item.station ? `Station: ${item.station}.` : '',
    item.pain !== undefined ? `Pain logged: ${item.pain}/10.` : '',
    '',
    `Note: """${item.note}"""`,
    '',
    'Turn the note into changes to his log, only ones the note clearly says:',
    '- pain: a pain or discomfort level (0–10). Translate words: twinge ≈ 2, sore ≈ 3–4, sharp/had to stop ≈ 6+.',
    '- station: the machine or cable he used, if named.',
    '- sets: what he actually did when it differs from what is logged. List every set from set 1, all of them.',
    canSwap
      ? '- swap: an exercise from the catalogue to do instead next time, if he says this one did not work for him.'
      : '- (no swaps: this workout is not from a routine)',
    'Return an empty list if the note is just a remark. Never invent numbers.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const num = (x: number | null | undefined) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Keeps the suggestions that make sense for this item (known swap ids, pain 0–10, sets with numbers). */
export function toSuggestions(raw: RawSuggestion[], item: WorkoutItem, ex: Exercise, lookup: Lookup, canSwap: boolean): NoteSuggestion[] {
  const out: NoteSuggestion[] = [];
  for (const r of raw ?? []) {
    const label = (r.label || '').trim().slice(0, 60);
    if (r.kind === 'pain' && num(r.pain) !== undefined) {
      const pain = Math.min(10, Math.max(0, Math.round(r.pain!)));
      if (pain !== item.pain) out.push({ kind: 'pain', pain, label: label || `Pain ${pain}/10` });
    } else if (r.kind === 'station' && r.station?.trim()) {
      const station = r.station.trim().slice(0, 40);
      if (station !== item.station) out.push({ kind: 'station', station, label: label || `Station ${station}` });
    } else if (r.kind === 'sets' && r.sets?.length) {
      const sets = r.sets.slice(0, 12).map((s) => {
        const e: { weight?: number; reps?: number; seconds?: number } = {};
        if (num(s.weight) !== undefined && s.weight! >= 0) e.weight = s.weight!;
        if (num(s.reps) !== undefined && s.reps! > 0) e.reps = Math.round(s.reps!);
        if (num(s.seconds) !== undefined && s.seconds! > 0) e.seconds = Math.round(s.seconds!);
        return e;
      });
      if (sets.every((s) => Object.keys(s).length)) out.push({ kind: 'sets', sets, label: label || sets.map(setText).join(', ') });
    } else if (r.kind === 'swap' && canSwap && r.exerciseId && r.exerciseId !== ex.id) {
      const next = lookup(r.exerciseId);
      if (next) out.push({ kind: 'swap', exerciseId: next.id, label: label || `Next time: ${next.name}` });
    }
  }
  return out;
}

/** Does a suggestion to the workout (a swap changes the routine instead: see swapInRoutine) and removes it. */
export function applySuggestion(w: Workout, itemId: string, index: number, history: Workout[], lookup: Lookup): Workout {
  const item = findItem(w, itemId);
  const s = item?.noteSuggestions?.[index];
  if (!item || !s) return w;
  let next = dismissSuggestion(w, itemId, index);
  if (s.kind === 'pain') {
    next = mapItem(next, itemId, (i) => ({ ...i, trackPain: true }));
    next = setPain(next, itemId, s.pain);
  } else if (s.kind === 'station') {
    next = setStation(next, itemId, s.station, history, lookup);
  } else if (s.kind === 'sets') {
    next = mapItem(next, itemId, (i) =>
      deriveStatus({
        ...i,
        status: i.status === 'skipped' ? 'pending' : i.status,
        sets: s.sets.map((p, k) => ({ ...(i.sets[k] ?? i.sets[i.sets.length - 1] ?? {}), ...p, done: true })),
      }),
    );
  }
  return next;
}

export function dismissSuggestion(w: Workout, itemId: string, index: number): Workout {
  return mapItem(w, itemId, (i) => ({ ...i, noteSuggestions: (i.noteSuggestions ?? []).filter((_, k) => k !== index) }));
}

/** The routine with `fromId` replaced by `toId` (first place it appears), keeping sets, reps and station. */
export function swapInRoutine(r: Routine, fromId: string, toId: string, lookup: Lookup): Routine | null {
  let done = false;
  const to = lookup(toId);
  if (!to) return null;
  const blocks = r.blocks.map((b) =>
    b.rehabDose
      ? b
      : {
          ...b,
          items: b.items.map((i) => {
            if (done || i.exerciseId !== fromId) return i;
            done = true;
            const { weight: _, seconds, reps, ...rest } = i;
            return to.type === 'timed'
              ? { ...rest, exerciseId: toId, ...(seconds ? { seconds } : {}) }
              : { ...rest, exerciseId: toId, ...(reps ? { reps } : {}) };
          }),
        },
  );
  return done ? { ...r, blocks } : null;
}
