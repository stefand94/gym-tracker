import { MUSCLE_LABELS } from '../data/muscles';
import type { Exercise } from '../types';

// Applied to names, aliases and queries alike, so "one arm cable row" and "Single-arm cable row" meet.
const PHRASES: [RegExp, string][] = [
  [/\b(one|1|single)\s*(arm|handed|hand)\b|\bunilateral\b/g, 'single'],
  [/\b(one|1)\s*leg\b/g, 'single leg'],
  [/\b(ez|z)\s*bar\b|\bezbar\b|\bzbar\b/g, 'ez'],
  [/\bpull\s+downs?\b/g, 'pulldown'],
  [/\bpush\s+downs?\b/g, 'pushdown'],
  [/\b(push|pull|chin|sit|step)\s+ups?\b/g, '$1up'],
  [/\bpull\s+through\b/g, 'pullthrough'],
  [/\bwood\s+chop/g, 'woodchop'],
  [/\brdls?\b/g, 'romanian deadlift'],
  [/\bohp\b/g, 'overhead press'],
  [/\bdbs?\b|\bdumbell\b/g, 'dumbbell'],
  [/\bbb\b/g, 'barbell'],
  [/\bkb\b/g, 'kettlebell'],
  [/\b(flye|flyes|flies)\b/g, 'fly'],
];

/** Lowercase, punctuation to spaces, synonyms folded, light plural stripping ("curls" → "curl"). */
export function normalize(text: string): string {
  let s = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  return s
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t))
    .join(' ');
}

const tokens = (text: string) => normalize(text).split(' ').filter(Boolean);
const covers = (hay: string[], needles: string[]) => needles.every((n) => hay.some((h) => h.startsWith(n)));

/**
 * How well `e` matches the query, lower is better; null when it doesn't match.
 * 0 name starts with the query · 1 every word is in the name · 2 via an alias · 3 via equipment/muscles.
 */
function matchTier(e: Exercise, query: string): number | null {
  const q = tokens(query);
  if (!q.length) return 0;
  const name = tokens(e.name);
  if (normalize(e.name).startsWith(q.join(' '))) return 0;
  if (covers(name, q)) return 1;
  const aliases = (e.aliases ?? []).map(tokens);
  if (aliases.some((a) => covers(a, q)) || covers([...name, ...aliases.flat()], q)) return 2;
  const extra = [...tokens(e.equipment), ...[...e.primary, ...e.secondary].flatMap((m) => tokens(MUSCLE_LABELS[m]))];
  if (covers([...name, ...aliases.flat(), ...extra], q)) return 3;
  return null;
}

/** Matching exercises, best first (then A–Z). An empty query returns the list as given. */
export function searchExercises(list: Exercise[], query: string): Exercise[] {
  if (!query.trim()) return list;
  return list
    .map((e) => ({ e, tier: matchTier(e, query) }))
    .filter((x): x is { e: Exercise; tier: number } => x.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.e.name.localeCompare(b.e.name))
    .map((x) => x.e);
}
