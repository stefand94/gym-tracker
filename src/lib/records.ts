import type { Exercise, Lookup, SetEntry, Workout, WorkoutItem } from '../types';
import { stationKey } from './prefill';
import { epley } from './progress';

/**
 * How a set ranks for personal records: estimated 1RM for weights and machines, reps for bodyweight, seconds for
 * holds. Null when records don't make sense: carries and sleds (reps are metres), assisted machines (less is
 * better), and bodyweight or timed sets with added weight.
 */
function setScore(ex: Exercise, s: SetEntry): number | null {
  if (/metres|assist/i.test(`${ex.weightNote ?? ''} ${ex.cue ?? ''}`)) return null;
  if (ex.type === 'timed') return s.weight ? null : s.seconds || null;
  if (ex.type === 'bodyweight') return s.weight ? null : s.reps || null;
  const v = epley(s.weight ?? 0, s.reps ?? 0);
  return v > 0 ? v : null;
}

const byStart = (a: Workout, b: Workout) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0);

/**
 * Walks workouts oldest first, keeping the best score per exercise (and per exercise on each station, since
 * stations differ). For each item, the indexes of the done sets that beat the best so far. The first time an
 * exercise is done (or done on a station) only sets the bar.
 */
function scan(workouts: Workout[], lookup: Lookup, onItem: (w: Workout, item: WorkoutItem, prs: number[], ex: Exercise) => void) {
  const best = new Map<string, number>();
  for (const w of workouts)
    for (const b of w.blocks)
      for (const i of b.items) {
        const ex = lookup(i.exerciseId);
        if (!ex || i.status === 'skipped') continue;
        const key = i.station ? `${i.exerciseId}@${stationKey(i.station)}` : i.exerciseId;
        const before = best.get(key);
        const prs: number[] = [];
        let bar = before;
        let top = before ?? -Infinity;
        i.sets.forEach((s, n) => {
          const v = s.done ? setScore(ex, s) : null;
          if (v === null) return;
          if (bar !== undefined && v > bar + 1e-9) {
            prs.push(n);
            bar = v;
          }
          top = Math.max(top, v);
        });
        if (top > -Infinity) {
          best.set(key, top);
          // a station's record also counts toward the exercise overall
          if (i.station) best.set(i.exerciseId, Math.max(best.get(i.exerciseId) ?? -Infinity, top));
        }
        onItem(w, i, prs, ex);
      }
}

let memo: { history: Workout[]; w: Workout; out: Map<string, number[]> } | null = null;

/** The record sets in one workout (finished or in progress), by item id, against every workout before it. */
export function recordsIn(w: Workout, history: Workout[], lookup: Lookup): Map<string, number[]> {
  if (memo && memo.history === history && memo.w === w) return memo.out;
  const prior = history.filter((x) => x.finishedAt && x.id !== w.id && x.startedAt < w.startedAt).sort(byStart);
  const out = new Map<string, number[]>();
  scan([...prior, w], lookup, (x, item, prs) => {
    if (x === w && prs.length) out.set(item.id, prs);
  });
  memo = { history, w, out };
  return out;
}

export interface PersonalRecord {
  workoutId: string;
  date: string;
  exerciseId: string;
  set: SetEntry;
  station?: string;
}

/** The newest records across finished workouts: each item's best record set, newest first. */
export function recentRecords(history: Workout[], lookup: Lookup, limit = 8): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  scan(history.filter((w) => w.finishedAt).sort(byStart), lookup, (w, item, prs, ex) => {
    if (!prs.length) return;
    const k = prs.reduce((a, b) => ((setScore(ex, item.sets[b]) ?? 0) > (setScore(ex, item.sets[a]) ?? 0) ? b : a));
    out.push({
      workoutId: w.id,
      date: w.startedAt,
      exerciseId: item.exerciseId,
      set: item.sets[k],
      ...(item.station ? { station: item.station } : {}),
    });
  });
  return out.reverse().slice(0, limit);
}
