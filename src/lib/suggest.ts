import { MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import type { Lookup, Routine, Workout } from '../types';
import { exerciseGroup } from './groups';
import { emptyLoad, loadSince, PRIMARY_CREDIT, SECONDARY_CREDIT, type MuscleLoad } from './muscleLoad';
import type { RehabState } from './rehab';

/** Small muscles that get worked by nearly everything; they shouldn't steer the pick. */
const IGNORE: MuscleId[] = ['neck', 'forearms'];
/** Weighted sets a muscle "wants" per 7 days before it counts as covered. */
const WEEK_TARGET = 10;
/** Weighted sets in 48 h that count as fully fatigued. */
const FATIGUE_FULL = 6;
const FATIGUE_WEIGHT = 0.7;

/** What a routine plans to train: planned sets × credit per muscle (the rehab dose block isn't counted). */
function routineCoverage(r: Routine, lookup: Lookup): MuscleLoad {
  const load = emptyLoad();
  for (const b of r.blocks) {
    if (b.rehabDose) continue;
    for (const i of b.items) {
      const ex = lookup(i.exerciseId);
      if (!ex) continue;
      const sets = i.sets ?? ex.defaults.sets;
      for (const m of ex.primary) load[m] += sets * PRIMARY_CREDIT;
      for (const m of ex.secondary) load[m] += sets * SECONDARY_CREDIT;
    }
  }
  return load;
}

/** Any leg exercise outside the rehab dose: kept back while the hamstring rehab isn't finished. */
export function hasLegWork(r: Routine, lookup: Lookup): boolean {
  return r.blocks.some(
    (b) =>
      !b.rehabDose &&
      b.items.some((i) => {
        const ex = lookup(i.exerciseId);
        return !!ex && exerciseGroup(ex) === 'legs';
      }),
  );
}

export interface Suggestion {
  routine: Routine;
  score: number;
  /** Why it's suggested, e.g. "Lats and biceps are lowest this week". */
  reason: string;
  /** Set when it shouldn't be done yet, e.g. "After hamstring rehab". */
  blocked?: string;
}

const label = (m: MuscleId) => MUSCLE_LABELS[m];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/**
 * Rank routines by how well they hit muscles that are behind this week and rested:
 * score = Σ coverage·(need − 0.7·fatigue) / Σ coverage, with need = 1 − 7-day sets/10 and fatigue = 48 h sets/6.
 * Rehab phase routines aren't ranked (the rehab card has them); leg work waits until the rehab is done.
 */
export function suggest(routines: Routine[], history: Workout[], lookup: Lookup, rehab: RehabState | null, now = new Date()): Suggestion[] {
  const week = loadSince(history, 7, lookup, now);
  const recent = loadSince(history, 2, lookup, now);
  const need = (m: MuscleId) => Math.max(0, 1 - week[m] / WEEK_TARGET);
  const fatigue = (m: MuscleId) => Math.min(1, recent[m] / FATIGUE_FULL);
  const anyThisWeek = Object.values(week).some((v) => v > 0);
  const holdLegs = !!rehab && !rehab.done;

  const out = routines
    .filter((r) => !r.archived && !r.rehab)
    .map((routine, order) => {
      const cov = routineCoverage(routine, lookup);
      const muscles = (Object.keys(cov) as MuscleId[]).filter((m) => cov[m] > 0 && !IGNORE.includes(m));
      const total = muscles.reduce((s, m) => s + cov[m], 0);
      const score = total ? muscles.reduce((s, m) => s + cov[m] * (need(m) - FATIGUE_WEIGHT * fatigue(m)), 0) / total : -1;
      // the muscles it does most for: biggest coverage × need, primary-sized only
      const top = muscles
        .filter((m) => cov[m] >= 2 && need(m) > 0.4)
        .sort((a, b) => cov[b] * need(b) - cov[a] * need(a))
        .slice(0, 2);
      let reason: string;
      if (!anyThisWeek) reason = 'Nothing logged this week yet';
      else if (top.length)
        reason = `${joinNames(top.map((m, i) => (i ? label(m).toLowerCase() : label(m))))} ${top.length > 1 ? 'are' : 'is'} lowest this week`;
      else reason = 'Most rested option';
      const blocked = holdLegs && hasLegWork(routine, lookup) ? `After ${rehab!.area} rehab` : undefined;
      return { routine, score, reason, blocked, order };
    });

  out.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.score - a.score || a.order - b.order);
  return out.map(({ order: _order, ...s }) => s);
}
