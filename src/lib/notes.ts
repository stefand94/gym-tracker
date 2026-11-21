import type { Exercise, Lookup, NoteMessage, NoteSuggestion, Routine, Workout, WorkoutItem } from '../types';
import { deriveStatus, setPain, setStation } from './workout';

const mapItem = (w: Workout, itemId: string, fn: (i: WorkoutItem) => WorkoutItem): Workout => ({
  ...w,
  blocks: w.blocks.map((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? fn(i) : i)) })),
});

export const findItem = (w: Workout, itemId: string) => w.blocks.flatMap((b) => b.items).find((i) => i.id === itemId);

type Noted = { note?: string; noteThread?: NoteMessage[]; noteSuggestions?: NoteSuggestion[] };

/** The note as a chat. Notes from before threads become one message (read, if Claude had read it). */
export function threadOf(x: Noted): NoteMessage[] {
  if (x.noteThread) return x.noteThread;
  if (!x.note) return [];
  const me: NoteMessage = { from: 'me', text: x.note, at: '' };
  return x.noteSuggestions === undefined ? [me] : [me, { from: 'claude', text: '', at: '' }];
}

/** `note` is always Stefan's messages, one per line (what History, Ask and the data repo read). */
function withThread<T extends Noted>(x: T, thread: NoteMessage[]): T {
  const { note: _, noteThread: __, ...rest } = x;
  const mine = thread.filter((m) => m.from === 'me');
  if (!mine.length) {
    const { noteSuggestions: ___, ...bare } = rest as T;
    return bare as T;
  }
  return { ...rest, note: mine.map((m) => m.text).join('\n'), noteThread: thread } as T;
}

const clean = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

/** Adds one of Stefan's messages to a note (an empty one does nothing). */
export function addNote<T extends Noted>(x: T, text: string, at: string): T {
  const t = clean(text);
  return t ? withThread(x, [...threadOf(x), { from: 'me', text: t, at }]) : x;
}

/** Removes one of Stefan's messages; removing the last one removes the note (and its chips). */
export function removeNote<T extends Noted>(x: T, index: number): T {
  const thread = threadOf(x);
  return thread[index]?.from === 'me'
    ? withThread(
        x,
        thread.filter((_, k) => k !== index),
      )
    : x;
}

/**
 * Claude's reply to the first `seen` messages: put right after them (so anything Stefan sent meanwhile still
 * counts as unread), with its chips merged into the waiting ones (a newer chip of the same kind replaces an older one).
 */
export function addReply<T extends Noted>(x: T, seen: number, reply: string, suggestions: NoteSuggestion[], at: string): T {
  const thread = threadOf(x);
  const k = Math.min(seen, thread.length);
  const next = [...thread.slice(0, k), { from: 'claude' as const, text: reply.trim().slice(0, 300), at }, ...thread.slice(k)];
  const kinds = new Set(suggestions.map((s) => s.kind));
  const kept = (x.noteSuggestions ?? []).filter((s) => !kinds.has(s.kind));
  return { ...withThread(x, next), noteSuggestions: [...kept, ...suggestions] };
}

export const addItemNote = (w: Workout, itemId: string, text: string, at: string) => mapItem(w, itemId, (i) => addNote(i, text, at));
export const removeItemNote = (w: Workout, itemId: string, index: number) => mapItem(w, itemId, (i) => removeNote(i, index));

/** Stefan has written something Claude hasn't replied to yet. */
export const unreadNote = (i: WorkoutItem) => threadOf(i).at(-1)?.from === 'me';

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
  required: ['reply', 'suggestions'],
  properties: {
    reply: {
      type: 'string',
      description:
        'One short line back to Stefan, like a training partner: what you took from it, or a question if something is unclear. Empty if the chips say it all.',
    },
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
  const thread = threadOf(item);
  const lastReply = thread.map((m) => m.from).lastIndexOf('claude');
  const earlier = thread.slice(0, lastReply + 1).filter((m) => m.text);
  const fresh = thread.slice(lastReply + 1).map((m) => m.text);
  const waiting = item.noteSuggestions ?? [];
  return [
    `Stefan is writing notes on "${ex.name}" (${ex.id}, ${ex.type}${ex.weightNote ? `, kg ${ex.weightNote}` : ''}) during his workout, like a chat with you.`,
    `Logged so far: ${item.sets.map((s, i) => `set ${i + 1} ${setText(s)}${s.done ? ' ✓' : ''}`).join('; ')}.`,
    item.station ? `Station: ${item.station}.` : '',
    item.pain !== undefined ? `Pain logged: ${item.pain}/10.` : '',
    earlier.length ? `Earlier in this note:\n${earlier.map((m) => `${m.from === 'me' ? 'Stefan' : 'You'}: ${m.text}`).join('\n')}` : '',
    waiting.length ? `Already suggested, waiting for his tap: ${waiting.map((s) => s.label).join('; ')}.` : '',
    '',
    `Note: """${fresh.join('\n')}"""`,
    '',
    'Turn what he just wrote into changes to his log, only ones it clearly says (earlier messages are context;',
    'if he is answering your question, use the answer):',
    '- pain: a pain or discomfort level (0–10). Translate words: twinge ≈ 2, sore ≈ 3–4, sharp/had to stop ≈ 6+.',
    '- station: the machine or cable he used, if named.',
    '- sets: what he actually did when it differs from what is logged. List every set from set 1, all of them.',
    canSwap
      ? '- swap: an exercise from the catalogue to do instead next time, if he says this one did not work for him.'
      : '- (no swaps: this workout is not from a routine)',
    'If he takes back an earlier message ("scrap that", "ignore that"), that message no longer counts: go by the new one and do not ask about the old.',
    'Return an empty list if it is just a remark. Never invent numbers. Do not repeat a suggestion that is already waiting.',
    'reply: one short line, no praise words. Ask a question only when an answer would change his log (e.g. which set hurt).',
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
