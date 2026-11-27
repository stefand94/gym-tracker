/**
 * Today's workout, built in code from Stefan's own history: the muscles that are behind this week and rested,
 * a loose push/pull lean away from the last session, the exercises he actually does (and at most one new one),
 * the supersets he likes, sized to the minutes he has. The rehab dose goes at the end.
 */

import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import type { Exercise, Lookup, Routine, RoutineBlock, RoutineItem, Workout } from '../types';
import { heldBack } from './aiContext';
import { exerciseGroup, type Group } from './groups';
import { loadSince, PRIMARY_CREDIT, SECONDARY_CREDIT } from './muscleLoad';
import { finishedNewestFirst, lastStation, stationKey } from './prefill';
import { doseItems, findDoseBlock, type RehabState } from './rehab';

export type Area = 'shoulders' | 'chest' | 'back' | 'arms' | 'core' | 'legs';
export type Kit = 'barbell' | 'cables' | 'dumbbells';
export type Avoid = Area | Kit;

export const AREAS: Area[] = ['shoulders', 'chest', 'back', 'arms', 'core', 'legs'];
export const KITS: Kit[] = ['barbell', 'cables', 'dumbbells'];
export const AVOID_LABELS: Record<Avoid, string> = {
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
  barbell: 'Barbell',
  cables: 'Cables',
  dumbbells: 'Dumbbells',
};

export const AREA_MUSCLES: Record<Area, MuscleId[]> = {
  shoulders: ['frontDelts', 'sideDelts', 'rearDelts'],
  chest: ['chest'],
  back: ['lats', 'upperBack', 'traps'],
  arms: ['biceps', 'triceps', 'forearms'],
  core: ['abs', 'obliques'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors', 'lowerBack'],
};

const KIT_MATCH: Record<Kit, RegExp> = { barbell: /barbell|ez bar|smith/i, cables: /cable/i, dumbbells: /dumbbell/i };

/** Functional-area kit Stefan wants left out unless he asks (kettlebells, sled, boxes, medicine balls) and the track. */
const NOT_PROGRAMMED = /kettlebell|sled|box|medicine ball|treadmill/i;
/** Machines worth programming as a new exercise (he prefers free weights and cables). */
const MACHINES_OK = ['leg-press', 'leg-curl', 'leg-extension'];

export const TIME_CHOICES = [30, 45, 60, 75];

/** 45 min on weekdays, 60 at weekends. */
export function defaultMinutes(now = new Date()): number {
  const d = now.getDay();
  return d === 0 || d === 6 ? 60 : 45;
}

export interface DailyOptions {
  minutes: number;
  focus?: Area;
  avoid?: Avoid[];
}

export interface DailyInput {
  history: Workout[];
  /** Every routine, archived ones too (for the supersets he set up and the rehab dose). */
  routines: Routine[];
  exercises: Exercise[];
  lookup: Lookup;
  rehab: RehabState | null;
  now?: Date;
}

export interface DailyPlan {
  routine: Routine;
  /** Why these, e.g. "Side delts and lats are lowest this week · leaning pull after a push day". */
  reason: string;
  /** Estimated minutes, rehab dose included. */
  minutes: number;
  /** Exercises he hasn't logged before (at most one). */
  newIds: string[];
}

export const DAILY_ID = 'daily';

// ---- Time ----

/** Minutes, from his logged sessions (sets aren't timestamped yet, so these are fitted by hand). */
const T = {
  setup: 1,
  supersetSetup: 1.5,
  work: 0.75,
  rest: 1.25,
  heavyRest: 1.75,
  lightRest: 1,
  switch: 0.25,
  roundRest: 1,
  warmupSet: 0.75,
};

function workMinutes(ex: Exercise | undefined, item: RoutineItem): number {
  if (ex?.type === 'timed') return (item.seconds ?? ex.defaults.seconds ?? 30) / 60 + 0.25;
  return T.work;
}

/** Estimated minutes for one block, rest and setting up included. */
export function blockMinutes(b: RoutineBlock, lookup: Lookup): number {
  const sets = (i: RoutineItem) => i.sets ?? lookup(i.exerciseId)?.defaults.sets ?? 3;
  if (b.superset && b.items.length > 1) {
    const rounds = Math.max(...b.items.map(sets));
    const work = b.items.reduce((s, i) => s + workMinutes(lookup(i.exerciseId), i), 0);
    return T.supersetSetup + rounds * (work + T.switch * (b.items.length - 1) + T.roundRest);
  }
  return b.items.reduce((total, i) => {
    const ex = lookup(i.exerciseId);
    const rest = ex?.warmup ? T.heavyRest : ex?.type === 'timed' || ex?.type === 'bodyweight' ? T.lightRest : T.rest;
    const warm = ex?.warmup ? 3 * T.warmupSet : 0;
    return total + T.setup + warm + sets(i) * (workMinutes(ex, i) + rest);
  }, 0);
}

export function planMinutes(blocks: RoutineBlock[], lookup: Lookup): number {
  return blocks.reduce((s, b) => s + blockMinutes(b, lookup), 0);
}

// ---- What he does ----

export interface Habits {
  /** Sessions each exercise was done in. */
  times: Map<string, number>;
  /** How often two exercises were supersetted (logged or set up in a routine), keyed "a|b". */
  pairs: Map<string, number>;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function habits(history: Workout[], routines: Routine[]): Habits {
  const times = new Map<string, number>();
  const pairs = new Map<string, number>();
  const addPairs = (ids: string[], weight: number) => {
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) pairs.set(pairKey(ids[a], ids[b]), (pairs.get(pairKey(ids[a], ids[b])) ?? 0) + weight);
  };
  for (const w of finishedNewestFirst(history)) {
    for (const b of w.blocks) {
      const done = b.items.filter((i) => i.status !== 'skipped' && i.sets.some((s) => s.done)).map((i) => i.exerciseId);
      for (const id of new Set(done)) times.set(id, (times.get(id) ?? 0) + 1);
      if (b.superset && !b.rehabDose) addPairs(done, 1);
    }
  }
  for (const r of routines)
    for (const b of r.blocks)
      if (b.superset && !b.rehabDose)
        addPairs(
          b.items.map((i) => i.exerciseId),
          0.5,
        );
  return { times, pairs };
}

// ---- Picking ----

/** Muscles that get worked by nearly everything: they don't steer the pick. */
const IGNORE: MuscleId[] = ['neck', 'forearms'];
const WEEK_TARGET = 10;
const FATIGUE_FULL = 6;
const FATIGUE_WEIGHT = 0.7;
/** Shoulders are a focus Stefan wants more of (a standing rule). */
const SHOULDER_BONUS: Partial<Record<MuscleId, number>> = { sideDelts: 0.1, rearDelts: 0.1 };
const LEAN_BONUS = 0.15;
const FOCUS_BONUS = 0.5;
/** A muscle well past its week's sets, or tired, counts against an exercise, but only so much. */
const OVER = -0.5;
const FLOOR = -0.6;

function areaOf(m: MuscleId): Area | null {
  for (const a of AREAS) if (AREA_MUSCLES[a].includes(m)) return a;
  return null;
}

/** Push or pull, whichever the last finished session did clearly more of; the lean goes the other way. */
function leanFrom(history: Workout[], lookup: Lookup): { lean: Group | null; last?: Workout } {
  const last = finishedNewestFirst(history)[0];
  if (!last) return { lean: null };
  let push = 0;
  let pull = 0;
  for (const b of last.blocks)
    for (const i of b.items) {
      if (i.status === 'skipped') continue;
      const ex = lookup(i.exerciseId);
      const g = ex && exerciseGroup(ex);
      const n = i.sets.filter((s) => s.done).length;
      if (g === 'push') push += n;
      if (g === 'pull') pull += n;
    }
  if (push > pull * 1.25 && push >= 4) return { lean: 'pull', last };
  if (pull > push * 1.25 && pull >= 4) return { lean: 'push', last };
  return { lean: null, last };
}

/** Exercises that can go in today's workout at all. */
function allowed(ex: Exercise, opts: DailyOptions, rehab: RehabState | null, dose: Set<string>): boolean {
  if (dose.has(ex.id) || ex.intervals || NOT_PROGRAMMED.test(ex.equipment)) return false;
  // grip-only and neck work (wrist curls, dead hangs) don't train what the day is picked for
  if (!ex.primary.length || ex.primary.every((m) => IGNORE.includes(m))) return false;
  if (heldBack(ex, rehab)) return false;
  for (const a of opts.avoid ?? []) {
    if (a in KIT_MATCH) {
      if (KIT_MATCH[a as Kit].test(ex.equipment)) return false;
    } else if (ex.primary.some((m) => AREA_MUSCLES[a as Area].includes(m))) return false;
  }
  return true;
}

const setsFor = (ex: Exercise) => Math.min(4, Math.max(2, ex.defaults.sets || 3));

/** The order inside the workout: heavy barbell lifts first, then the rest as picked, core last. */
function ordered(list: Exercise[]): Exercise[] {
  const rank = (e: Exercise) => (e.warmup ? 0 : exerciseGroup(e) === 'core' ? 2 : 1);
  return list
    .map((e, n) => ({ e, n }))
    .sort((a, b) => rank(a.e) - rank(b.e) || a.n - b.n)
    .map(({ e }) => e);
}

const equipClass = (ex: Exercise) =>
  /cable/i.test(ex.equipment) ? 'cable' : /dumbbell/i.test(ex.equipment) ? 'dumbbells' : ex.equipment.toLowerCase();

/**
 * Blocks for the chosen exercises, in their order: the best-matched pairs go first, scored on how often he has
 * supersetted them, the same station, the same kit and push with pull. Two exercises for the same main muscle
 * never pair; core pairs only with core; heavy barbell lifts stay on their own unless time is very short. With
 * more time, only pairs he already does (or that share a station) are made.
 */
export function layoutBlocks(list: Exercise[], minutes: number, h: Habits, history: Workout[]): RoutineBlock[] {
  const station = new Map(list.map((e) => [e.id, lastStation(e.id, history)]));
  const score = (a: Exercise, b: Exercise): number => {
    if (a.primary.some((m) => b.primary.includes(m))) return -1;
    if ((a.warmup || b.warmup) && minutes > 30) return -1;
    const ga = exerciseGroup(a);
    const gb = exerciseGroup(b);
    if ((ga === 'core') !== (gb === 'core')) return -1;
    const sa = station.get(a.id);
    const sb = station.get(b.id);
    let s = (h.pairs.get(pairKey(a.id, b.id)) ?? 0) * 3;
    if (sa && sb && stationKey(sa) === stationKey(sb)) s += 2;
    if (equipClass(a) === equipClass(b)) s += 1;
    if (ga !== gb) s += 0.5;
    return s;
  };
  const need = minutes <= 45 ? 1 : 2.5;
  const options: { a: number; b: number; s: number }[] = [];
  for (let a = 0; a < list.length; a++)
    for (let b = a + 1; b < list.length; b++) {
      const s = score(list[a], list[b]);
      if (s >= need) options.push({ a, b, s });
    }
  options.sort((x, y) => y.s - x.s || x.a - y.a || x.b - y.b);
  const partner = new Map<number, number>();
  for (const { a, b } of options) {
    if (partner.has(a) || partner.has(b)) continue;
    partner.set(a, b);
    partner.set(b, a);
  }
  const item = (e: Exercise): RoutineItem => ({ exerciseId: e.id, sets: setsFor(e) });
  const blocks: RoutineBlock[] = [];
  const placed = new Set<number>();
  list.forEach((e, n) => {
    if (placed.has(n)) return;
    placed.add(n);
    const p = partner.get(n);
    if (p === undefined) return blocks.push({ items: [item(e)] });
    placed.add(p);
    blocks.push({ superset: true, items: [item(e), item(list[p])] });
  });
  return blocks;
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Builds today's workout. Same inputs, same workout. */
export function buildDaily(input: DailyInput, opts: DailyOptions): DailyPlan {
  const { history, routines, exercises, lookup, rehab, now = new Date() } = input;
  const minutes = opts.minutes;
  const h = habits(history, routines);

  // the rehab dose, as it will be filled in when the workout starts
  const doseBlock = rehab ? findDoseBlock(routines, rehab.area) : null;
  const dose: RoutineBlock | null = doseBlock ? { ...doseBlock, items: doseItems(doseBlock, rehab, routines, lookup) } : null;
  const doseIds = new Set(dose?.items.map((i) => i.exerciseId));
  const doseMinutes = dose ? blockMinutes(dose, lookup) : 0;

  // how much each muscle wants work today
  const week = loadSince(history, 7, lookup, now);
  const recent = loadSince(history, 2, lookup, now);
  const { lean, last } = leanFrom(history, lookup);
  const want = {} as Record<MuscleId, number>;
  for (const m of MUSCLE_IDS) {
    if (IGNORE.includes(m)) {
      want[m] = 0;
      continue;
    }
    // past the target still ranks muscles (a bit over beats a lot over), so the time always gets filled
    const need = Math.max(OVER, 1 - week[m] / WEEK_TARGET);
    const fatigue = Math.min(1, recent[m] / FATIGUE_FULL);
    const area = areaOf(m);
    let w = need - FATIGUE_WEIGHT * fatigue + (SHOULDER_BONUS[m] ?? 0);
    if (lean && area !== 'core' && area !== 'legs') {
      const g = m === 'rearDelts' || m === 'lats' || m === 'upperBack' || m === 'traps' || m === 'biceps' ? 'pull' : 'push';
      if (g === lean) w += LEAN_BONUS;
    }
    if (opts.focus && area === opts.focus) w += FOCUS_BONUS;
    want[m] = w;
  }
  const start = { ...want };

  const pool = exercises.filter((e) => allowed(e, opts, rehab, doseIds));
  // secondary muscles count for less here than in the load, so big lifts don't crowd out the rest
  const value = (e: Exercise) =>
    e.primary.reduce((s, m) => s + Math.max(FLOOR, want[m]), 0) + e.secondary.reduce((s, m) => s + Math.max(FLOOR, want[m]) * 0.35, 0);
  const inFocus = (e: Exercise) => !!opts.focus && e.primary.some((m) => AREA_MUSCLES[opts.focus!].includes(m));
  const familiar = (e: Exercise) => {
    const n = h.times.get(e.id) ?? 0;
    return n ? 1 + 0.08 * Math.min(n, 5) : 0.8;
  };
  const canBeNew = (e: Exercise) => e.equipment !== 'Machine' || MACHINES_OK.includes(e.id);

  const chosen: Exercise[] = [];
  let newOne: string | null = null;
  const budget = minutes - doseMinutes;
  for (;;) {
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    // a focus gets at least half the exercises, starting with the first
    const focusTurn =
      !!opts.focus && chosen.filter(inFocus).length * 2 <= chosen.length && pool.some((e) => inFocus(e) && !chosen.includes(e));
    for (const e of pool) {
      if (chosen.includes(e) || (focusTurn && !inFocus(e))) continue;
      const isNew = !h.times.has(e.id);
      if (isNew && (newOne || !canBeNew(e))) continue;
      // one exercise per movement: not two that work exactly the same main muscles
      const same = (c: Exercise) => c.primary.length === e.primary.length && c.primary.every((m) => e.primary.includes(m));
      if (chosen.some(same)) continue;
      const v = value(e);
      // a better-known exercise wins on a good value; on a poor one familiarity mustn't make it worse
      const s = v >= 0 ? v * familiar(e) : v / familiar(e);
      if (s > bestScore) {
        best = e;
        bestScore = s;
      }
    }
    if (!best) break;
    const trial = ordered([...chosen, best]);
    const fits = planMinutes(layoutBlocks(trial, minutes, h, history), lookup) <= budget + 3;
    if (!fits && chosen.length >= 2) break;
    chosen.push(best);
    if (!h.times.has(best.id)) newOne = best.id;
    const sets = setsFor(best);
    for (const m of best.primary) want[m] -= (sets * PRIMARY_CREDIT) / WEEK_TARGET;
    for (const m of best.secondary) want[m] -= (sets * SECONDARY_CREDIT) / WEEK_TARGET;
    if (!fits) break;
  }

  const blocks = layoutBlocks(ordered(chosen), minutes, h, history);
  const all = dose ? [...blocks, doseBlock!] : blocks;

  // name: the areas it does most for
  const byArea = new Map<Area, number>();
  for (const e of chosen) {
    const sets = setsFor(e);
    for (const m of e.primary) {
      const a = areaOf(m);
      if (a) byArea.set(a, (byArea.get(a) ?? 0) + sets);
    }
  }
  const areas = [...byArea].sort((a, b) => b[1] - a[1]);
  const top = areas.filter(([, n], i) => i < 2 && n >= areas[0][1] * 0.5).map(([a]) => AVOID_LABELS[a]);
  const name = top.length ? top.join(' + ') : 'Workout';

  // reason: the muscles most behind that it trains, and the lean
  const trained = new Set(chosen.flatMap((e) => e.primary));
  // core is in most sessions: name it only when it's the focus or nothing else is behind
  const lagging = [...trained].filter((m) => !IGNORE.includes(m) && week[m] < WEEK_TARGET * 0.6);
  const notCore = lagging.filter((m) => areaOf(m) !== 'core');
  const behind = (opts.focus === 'core' || !notCore.length ? lagging : notCore).sort((a, b) => start[b] - start[a]).slice(0, 2);
  const anyThisWeek = MUSCLE_IDS.some((m) => week[m] > 0);
  const parts: string[] = [];
  if (opts.focus) parts.push(`${AVOID_LABELS[opts.focus]} focus`);
  if (!anyThisWeek) parts.push('Nothing logged this week yet');
  else if (behind.length)
    parts.push(
      `${joinNames(behind.map((m, i) => (i ? MUSCLE_LABELS[m].toLowerCase() : MUSCLE_LABELS[m])))} ${behind.length > 1 ? 'are' : 'is'} behind this week`,
    );
  else parts.push('Every muscle has had its sets this week: the most rested first');
  if (lean && last) parts.push(`leaning ${lean} after ${last.name}`);
  const reason = parts.join(' · ');

  return {
    routine: { id: DAILY_ID, name, blocks: all },
    reason: reason.charAt(0).toUpperCase() + reason.slice(1),
    minutes: Math.round(planMinutes(blocks, lookup) + doseMinutes),
    newIds: newOne ? [newOne] : [],
  };
}
