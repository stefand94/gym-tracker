import type { SetEntry, Workout, WorkoutItem } from '../types';

/** Finished workouts, newest first. */
export function finishedNewestFirst(history: Workout[]): Workout[] {
  return history
    .filter((w) => w.finishedAt)
    .sort((a, b) => (b.startedAt < a.startedAt ? -1 : b.startedAt > a.startedAt ? 1 : 0));
}

/** Performed items (done sets, not skipped) of one exercise, newest workout first. */
function performances(exerciseId: string, history: Workout[]): { item: WorkoutItem; done: SetEntry[] }[] {
  const out: { item: WorkoutItem; done: SetEntry[] }[] = [];
  for (const w of finishedNewestFirst(history))
    for (const b of w.blocks)
      for (const i of b.items) {
        if (i.exerciseId !== exerciseId || i.status === 'skipped') continue;
        const done = i.sets.filter((s) => s.done);
        if (done.length) out.push({ item: i, done });
      }
  return out;
}

/**
 * The done sets from the most recent finished workout that included this exercise. With a station, prefer
 * the last time on that station, falling back to any (or, with `strict`, to nothing).
 */
export function lastPerformance(exerciseId: string, history: Workout[], station?: string, strict = false): SetEntry[] | null {
  const all = performances(exerciseId, history);
  if (station) {
    const key = stationKey(station);
    const at = all.find((p) => p.item.station && stationKey(p.item.station) === key);
    if (at || strict) return at?.done ?? null;
  }
  return all[0]?.done ?? null;
}

/** Tidy a typed station name: trimmed, single spaces. */
export function cleanStation(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export const stationKey = (s: string) => cleanStation(s).toLowerCase();

/** Stations this exercise was done on, most recent first. */
export function stationsFor(exerciseId: string, history: Workout[]): string[] {
  return uniqueStations(performances(exerciseId, history).map((p) => p.item.station));
}

/** Every station used, most recent first. */
export function allStations(history: Workout[]): string[] {
  return uniqueStations(
    finishedNewestFirst(history).flatMap((w) => w.blocks.flatMap((b) => b.items.map((i) => i.station))),
  );
}

function uniqueStations(list: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    if (!s) continue;
    const k = stationKey(s);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

/** The station to default to: wherever this exercise was done last time. */
export function lastStation(exerciseId: string, history: Workout[]): string | undefined {
  return performances(exerciseId, history)[0]?.item.station;
}
