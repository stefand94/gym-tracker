/** Stall detection: an exercise that hasn't moved for a while. The fixes it offers are in workout/stall.ts. */

import type { Exercise, Lookup, Routine, SetEntry, Stall, Workout } from '../types';
import { fmtNum } from './format';
import { finishedNewestFirst, lastStation, performances, stationKey, type Performance } from './prefill';
import { epley } from './progress';

/** Sessions in a row without beating the best before them. */
const FLAT = 4;
/** Sessions in a row with reps missed at the same weight. */
const MISSED = 2;
/** Fewer sessions than this (since the last fix) is too little to go on. */
const MIN_SESSIONS = 4;

const isAssisted = (ex: Exercise) => /assist/i.test(ex.weightNote ?? '');

/**
 * Whether the numbers are meant to climb. Not for carries and sleds (reps are metres), walk–jog intervals, or jumps
 * and throws, which are about speed.
 */
export function tracksStalls(ex: Exercise): boolean {
  if (ex.intervals || /metres/i.test(`${ex.weightNote ?? ''} ${ex.cue ?? ''}`)) return false;
  return !/jump|throw|wall ball/i.test(ex.name);
}

/** How good a session was; higher is better. Weight first, then reps or seconds; less help on assisted machines. */
function sessionScore(ex: Exercise, sets: SetEntry[]): number {
  return Math.max(
    ...sets.map((s) => {
      const kg = s.weight ?? 0;
      if (ex.type === 'timed') return kg * 1000 + (s.seconds ?? 0);
      if (ex.type === 'bodyweight') return kg * 1000 + (s.reps ?? 0);
      if (isAssisted(ex)) return -kg + (s.reps ?? 0) / 1000;
      return epley(kg, s.reps ?? 0);
    }),
  );
}

/** The one weight every set was done at, or null when they differ. */
function oneWeight(sets: SetEntry[]): number | null {
  const w = sets[0].weight ?? 0;
  return sets.every((s) => (s.weight ?? 0) === w) ? w : null;
}

/**
 * The sessions stall detection looks at, newest first: the ones on `station` when there are any, back to (and
 * including) the last one where a fix was picked.
 */
function windowFor(ex: Exercise, history: Workout[], station?: string): Performance[] {
  let all = performances(ex.id, history);
  if (station) {
    const key = stationKey(station);
    const at = all.filter((p) => p.item.station && stationKey(p.item.station) === key);
    if (at.length) all = at;
  }
  const fix = all.findIndex((p) => p.item.stallFix);
  return fix < 0 ? all : all.slice(0, fix + 1);
}

/** Why an exercise looks stuck, with the sessions that show it (newest first); null when it's moving. */
export function findStall(
  ex: Exercise,
  history: Workout[],
  station?: string,
  target?: number,
): { stall: Stall; sessions: Performance[] } | null {
  if (!tracksStalls(ex)) return null;
  const window = windowFor(ex, history, station);
  if (window.length < MIN_SESSIONS || window.some((p) => p.item.trackPain || p.item.pain !== undefined)) return null;
  const aim = target ? { target } : {};

  // the longest run of recent sessions whose best doesn't beat the best before them (once it fails, longer runs fail too)
  const scores = window.map((p) => sessionScore(ex, p.done));
  let flat = 0;
  for (let k = 1; k < scores.length; k++) {
    if (Math.max(...scores.slice(0, k)) > Math.max(...scores.slice(k)) + 1e-9) break;
    flat = k;
  }
  if (flat >= FLAT) return { stall: { kind: 'flat', sessions: flat, ...aim }, sessions: window.slice(0, flat) };

  if (target && ex.type !== 'timed') {
    let missed = 0;
    let at: number | null = null;
    for (const p of window) {
      const w = oneWeight(p.done);
      if (w === null || (at !== null && w !== at) || !p.done.some((s) => (s.reps ?? 0) < target)) break;
      at = w;
      missed++;
    }
    if (missed >= MISSED && at !== null)
      return { stall: { kind: 'missed', sessions: missed, weight: at, target }, sessions: window.slice(0, missed) };
  }
  return null;
}

export const stallFrom = (ex: Exercise, history: Workout[], station?: string, target?: number): Stall | null =>
  findStall(ex, history, station, target)?.stall ?? null;

/** The reps an exercise aims for: its routine's (the first one that has it), else its default. Null when it's pain-tracked. */
export function targetReps(ex: Exercise, routines: Routine[]): number | undefined | null {
  for (const r of routines) {
    if (r.archived || r.rehab) continue;
    for (const b of r.blocks) {
      if (b.rehabDose) continue;
      const item = b.items.find((i) => i.exerciseId === ex.id);
      if (item?.trackPain) return null;
      if (item) return item.reps ?? ex.defaults.reps;
    }
  }
  return ex.defaults.reps;
}

/** Where an exercise stands now (as the next workout would see it), with the sessions that show it. */
export function stallNow(ex: Exercise, history: Workout[], routines: Routine[]) {
  const target = targetReps(ex, routines);
  return target === null ? null : findStall(ex, history, lastStation(ex.id, history), target);
}

/** Every exercise done in the last 8 weeks that looks stuck now. */
export function stuckExercises(history: Workout[], routines: Routine[], lookup: Lookup, now = new Date()) {
  const since = now.getTime() - 56 * 864e5;
  const ids = new Set(
    finishedNewestFirst(history)
      .filter((w) => new Date(w.startedAt).getTime() >= since)
      .flatMap((w) => w.blocks.flatMap((b) => b.items.map((i) => i.exerciseId))),
  );
  const out: { ex: Exercise; stall: Stall }[] = [];
  for (const id of ids) {
    const ex = lookup(id);
    const found = ex && stallNow(ex, history, routines);
    if (ex && found) out.push({ ex, stall: found.stall });
  }
  return out;
}

/** "no progress in 5 sessions" / "reps missed 2 sessions running at 60 kg". */
export function stallText(s: Stall): string {
  if (s.kind === 'flat') return `no progress in ${s.sessions} sessions`;
  return `reps missed ${s.sessions} sessions running${s.weight ? ` at ${fmtNum(s.weight)} kg` : ''}`;
}
