import howtoJson from './howto.json';
import type { Exercise, HowTo } from '../types';

const BUNDLED = howtoJson as Record<string, HowTo>;

/** The written guide: one on the exercise itself (custom, or written by Claude) wins over the bundled one. */
export function howToFor(ex: Exercise): HowTo | undefined {
  return ex.howto ?? BUNDLED[ex.id];
}

/** YouTube search for the exercise's form videos. */
export function youtubeSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} form`)}`;
}

/** A pasted link, kept only if it's a plain http(s) URL (nothing like javascript:). */
export function cleanVideoUrl(input: string): string | null {
  const s = input.trim();
  try {
    const u = new URL(/^[a-z]+:/i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
