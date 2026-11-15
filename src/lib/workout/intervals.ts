/** Walk–jog intervals: in a superset, each interval's timer starts the moment the one before ends. */

import type { Lookup, Workout } from '../../types';
import { completeHold } from './sets';

/**
 * After an interval's timer ends: the next set in round order in the same superset, when it's an unticked
 * interval too (walk → jog → walk …), so its timer can start straight away.
 */
export function nextInterval(
  w: Workout,
  itemId: string,
  set: number,
  lookup: Lookup,
): { itemId: string; set: number; seconds: number } | null {
  const block = w.blocks.find((b) => b.items.some((i) => i.id === itemId));
  if (!block?.superset || !lookup(block.items.find((i) => i.id === itemId)!.exerciseId)?.intervals) return null;
  const order = block.items.filter((i) => i.status !== 'skipped');
  const rounds = Math.max(0, ...order.map((i) => i.sets.length));
  const seq = Array.from({ length: rounds }, (_, r) => order.filter((i) => r < i.sets.length).map((i) => ({ i, r }))).flat();
  const at = seq.findIndex((x) => x.i.id === itemId && x.r === set);
  const next = at >= 0 ? seq[at + 1] : undefined;
  if (!next) return null;
  const s = next.i.sets[next.r];
  if (s.done || !s.seconds || !lookup(next.i.exerciseId)?.intervals) return null;
  return { itemId: next.i.id, set: next.r, seconds: s.seconds };
}

type Hold = { itemId: string; set: number; goAt: number; endsAt: number };

/**
 * A hold that has run out: tick it, and with walk/jog intervals each one after it, timed from the moment the one
 * before ended — so the ones that ran out while the phone was locked are ticked too. Returns the workout, the
 * interval running now (if any) and the last hold ticked.
 */
export function finishHolds(w: Workout, hold: Hold, now: number, lookup: Lookup): { workout: Workout; next: Hold | null; last: Hold } {
  let cur = hold;
  let out = w;
  for (;;) {
    out = completeHold(out, cur.itemId, cur.set, Math.round((cur.endsAt - cur.goAt) / 1000));
    const n = nextInterval(out, cur.itemId, cur.set, lookup);
    if (!n) return { workout: out, next: null, last: cur };
    const next = { itemId: n.itemId, set: n.set, goAt: cur.endsAt, endsAt: cur.endsAt + n.seconds * 1000 };
    if (next.endsAt > now) return { workout: out, next, last: cur };
    cur = next;
  }
}
