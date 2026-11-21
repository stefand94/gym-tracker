/**
 * Two-sided holds (side plank): `seconds` is the left side and `secondsR` the right. Only sets of an exercise with
 * `sides: true` carry `secondsR`, so these work on any set.
 */

import type { SetEntry } from '../types';

/** The right side's seconds (the left's when the set has no right side of its own). */
export const rightSeconds = (s: SetEntry): number | undefined => s.secondsR ?? s.seconds;

/** A hold's seconds for records, stalls and progress: the weaker side on a two-sided hold. */
export const holdOf = (s: SetEntry): number => (s.secondsR !== undefined ? Math.min(s.seconds ?? 0, s.secondsR) : (s.seconds ?? 0));

/** Time under tension: both sides added up on a two-sided hold. */
export const holdTotal = (s: SetEntry): number => (s.seconds ?? 0) + (s.secondsR ?? 0);

/** "35" or, on a two-sided hold, "35/30" (left/right). */
export const fmtSeconds = (s: SetEntry): string => {
  const l = s.seconds === undefined ? '–' : String(Math.round(s.seconds * 100) / 100);
  return s.secondsR === undefined || s.secondsR === s.seconds ? l : `${l}/${Math.round(s.secondsR * 100) / 100}`;
};
