import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { ROUTINES, setCustomExercises } from '../data/library';
import { mergeKeyed, mergeVersioned } from '../lib/merge';
import { costUsd, type ModelKey, type TokenUsage } from '../lib/claude';
import type { Exercise, Routine, Workout } from '../types';

export interface SyncSettings {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

/** What a queued op writes. Missing on ops queued before routines synced: those are workouts. */
export type SyncKind = 'workout' | 'routine' | 'customExercises' | 'videos';

/** `t` tells a re-queued op apart from the one a running sync already finished. */
export type QueueOp =
  { op: 'put'; kind?: SyncKind; id: string; t?: number } | { op: 'delete'; kind?: SyncKind; id: string; path: string; t?: number };

export const CUSTOM_ID = 'custom';
export const VIDEOS_ID = 'videos';

/** A video pinned to an exercise; an empty url is a removed pin (kept so the removal syncs). */
export interface VideoPin {
  url: string;
  updatedAt: string;
}

export interface SyncState {
  queue: QueueOp[];
  lastSync?: string;
  error?: string;
  busy: boolean;
}

export interface Prefs {
  /** Start a rest countdown when a set is ticked. */
  rest: boolean;
  restSeconds: number;
  /** Countdown tucked into the header button instead of the full bar. */
  restMini: boolean;
}

/** Claude in the app. Lives only on this device: never synced, never in the repo. */
export interface AiSettings {
  key: string;
  /** Model for Ask (notes and helpers always use Haiku). */
  askModel: ModelKey;
  /** Running total since `since`. */
  spent: { calls: number; usd: number; input: number; output: number; since: string };
}

export interface RestState {
  endsAt: number;
  total: number;
}

/** A timed set being counted down. `goAt` is when the hold starts (after a short get-ready). */
export interface HoldState {
  itemId: string;
  set: number;
  goAt: number;
  endsAt: number;
}

export const HOLD_LEAD_IN = 5;

export interface State {
  history: Workout[];
  active: Workout | null;
  settings: SyncSettings;
  sync: SyncState;
  prefs: Prefs;
  rest: RestState | null;
  hold: HoldState | null;
  routines: Routine[];
  customExercises: Exercise[];
  /** Blob sha of each routine/custom file last pulled, so unchanged files aren't fetched again. */
  remoteShas: Record<string, string>;
  /** Pinned how-to videos by exercise id (synced as exercises/videos.json). */
  videos: Record<string, VideoPin>;
  ai: AiSettings;
}

export interface RemoteData {
  routines: Routine[];
  customExercises?: Exercise[];
  videos?: Record<string, VideoPin>;
  shas: Record<string, string>;
}

type Action =
  | { type: 'start'; workout: Workout }
  | { type: 'updateActive'; fn: (w: Workout) => Workout }
  | { type: 'finish'; now: string }
  | { type: 'discard' }
  | { type: 'delete'; id: string; path?: string }
  | { type: 'merge'; workouts: Workout[] }
  | { type: 'settings'; settings: Partial<SyncSettings> }
  | { type: 'syncStart' }
  | { type: 'syncDone'; completed: QueueOp[]; at: string }
  | { type: 'syncError'; error: string; completed: QueueOp[] }
  | { type: 'restore'; history: Workout[] }
  | { type: 'prefs'; prefs: Partial<Prefs> }
  | { type: 'restStart'; now: number }
  | { type: 'restAdjust'; seconds: number; now: number }
  | { type: 'restStop' }
  | { type: 'holdStart'; itemId: string; set: number; seconds: number; now: number }
  | { type: 'holdStop' }
  | { type: 'routineSave'; routine: Routine; now: string }
  | { type: 'routineArchive'; id: string; now: string }
  | { type: 'exerciseSave'; exercise: Exercise; now: string }
  | { type: 'remoteMerge'; remote: RemoteData }
  | { type: 'videoPin'; exerciseId: string; url: string; now: string }
  | { type: 'aiSettings'; ai: Partial<Pick<AiSettings, 'key' | 'askModel'>> }
  | { type: 'aiUsage'; model: ModelKey; usage: TokenUsage }
  | { type: 'aiUsageReset'; now: string }
  | { type: 'historyUpdate'; workout: Workout };

const KEY = 'gym-tracker:v1';

const emptySpent = (since = new Date().toISOString()) => ({ calls: 0, usd: 0, input: 0, output: 0, since });
const DEFAULT_AI = (): AiSettings => ({ key: '', askModel: 'haiku', spent: emptySpent() });

const DEFAULT_PREFS: Prefs = { rest: false, restSeconds: 90, restMini: false };
const REST_MIN = 15;
const REST_MAX = 600;

const DEFAULT_SETTINGS: SyncSettings = {
  token: '',
  owner: 'stefand94',
  repo: 'gym-tracker-data',
  branch: 'main',
};

/** Seeds are older than anything synced, so a copy from the data repo always replaces them. */
const SEED_TIME = '2000-01-01T00:00:00.000Z';

/** Add any bundled routine the user doesn't have yet (archived ones keep their id, so they stay gone). */
export function withSeedRoutines(routines: Routine[]): Routine[] {
  const have = new Set(routines.map((r) => r.id));
  const missing = ROUTINES.filter((r) => !have.has(r.id)).map((r) => ({ ...r, updatedAt: r.updatedAt ?? SEED_TIME }));
  return missing.length ? [...routines, ...missing] : routines;
}

export function load(): State {
  const base: State = {
    history: [],
    active: null,
    settings: DEFAULT_SETTINGS,
    sync: { queue: [], busy: false },
    prefs: DEFAULT_PREFS,
    rest: null,
    hold: null,
    routines: withSeedRoutines([]),
    customExercises: [],
    remoteShas: {},
    videos: {},
    ai: DEFAULT_AI(),
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      history: saved.history ?? [],
      active: saved.active ?? null,
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
      sync: { queue: saved.sync?.queue ?? [], lastSync: saved.sync?.lastSync, busy: false },
      prefs: { ...DEFAULT_PREFS, ...saved.prefs },
      rest: saved.rest ?? null,
      hold: saved.hold ?? null,
      routines: withSeedRoutines(saved.routines ?? []),
      customExercises: saved.customExercises ?? [],
      remoteShas: saved.remoteShas ?? {},
      videos: saved.videos ?? {},
      ai: { ...DEFAULT_AI(), ...saved.ai },
    };
  } catch {
    return base;
  }
}

const kindOf = (op: QueueOp): SyncKind => op.kind ?? 'workout';
const sameTarget = (a: QueueOp, b: { kind?: SyncKind; id: string }) => kindOf(a) === (b.kind ?? 'workout') && a.id === b.id;

export function sameOp(a: QueueOp, b: QueueOp) {
  return a.op === b.op && sameTarget(a, b) && a.t === b.t;
}

let seq = 0;
export function enqueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  const stamped = { ...op, t: Date.now() * 1000 + (seq++ % 1000) };
  return [...queue.filter((q) => !sameTarget(q, op)), stamped];
}

export function isPending(queue: QueueOp[], kind: SyncKind, id: string): boolean {
  return queue.some((q) => sameTarget(q, { kind, id }));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...state, active: action.workout };
    case 'updateActive':
      return state.active ? { ...state, active: action.fn(state.active) } : state;
    case 'finish': {
      if (!state.active) return state;
      const done: Workout = { ...state.active, finishedAt: action.now };
      return {
        ...state,
        active: null,
        rest: null,
        hold: null,
        history: [...state.history.filter((w) => w.id !== done.id), done],
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', id: done.id }) },
      };
    }
    case 'discard':
      return { ...state, active: null, rest: null, hold: null };
    case 'delete': {
      const queue = state.sync.queue.filter((q) => !sameTarget(q, { id: action.id }));
      return {
        ...state,
        history: state.history.filter((w) => w.id !== action.id),
        sync: {
          ...state.sync,
          queue: action.path ? [...queue, { op: 'delete', id: action.id, path: action.path }] : queue,
        },
      };
    }
    case 'merge': {
      const known = new Set(state.history.map((w) => w.id));
      const deleting = new Set(state.sync.queue.filter((q) => q.op === 'delete' && kindOf(q) === 'workout').map((q) => q.id));
      const fresh = action.workouts.filter((w) => !known.has(w.id) && !deleting.has(w.id));
      return fresh.length ? { ...state, history: [...state.history, ...fresh] } : state;
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'syncStart':
      return { ...state, sync: { ...state.sync, busy: true, error: undefined } };
    case 'syncDone':
      return {
        ...state,
        sync: {
          queue: state.sync.queue.filter((q) => !action.completed.some((c) => sameOp(c, q))),
          lastSync: action.at,
          busy: false,
        },
      };
    case 'syncError':
      return {
        ...state,
        sync: {
          ...state.sync,
          queue: state.sync.queue.filter((q) => !action.completed.some((c) => sameOp(c, q))),
          busy: false,
          error: action.error,
        },
      };
    case 'prefs':
      return { ...state, prefs: { ...state.prefs, ...action.prefs }, rest: action.prefs.rest === false ? null : state.rest };
    case 'restStart': {
      const total = state.prefs.restSeconds;
      return { ...state, rest: { endsAt: action.now + total * 1000, total } };
    }
    case 'restAdjust': {
      // Adjusting the running rest also becomes the length used next time.
      const restSeconds = Math.min(REST_MAX, Math.max(REST_MIN, state.prefs.restSeconds + action.seconds));
      const rest = state.rest
        ? {
            endsAt: Math.max(action.now, state.rest.endsAt + action.seconds * 1000),
            total: Math.max(REST_MIN, state.rest.total + action.seconds),
          }
        : null;
      return { ...state, rest, prefs: { ...state.prefs, restSeconds } };
    }
    case 'restStop':
      return state.rest ? { ...state, rest: null } : state;
    case 'holdStart': {
      // Starting a hold ends any rest that's still counting.
      const goAt = action.now + HOLD_LEAD_IN * 1000;
      return { ...state, rest: null, hold: { itemId: action.itemId, set: action.set, goAt, endsAt: goAt + action.seconds * 1000 } };
    }
    case 'holdStop':
      return state.hold ? { ...state, hold: null } : state;
    case 'restore': {
      const known = new Set(state.history.map((w) => w.id));
      const fresh = action.history.filter((w) => w.finishedAt && !known.has(w.id));
      let queue = state.sync.queue;
      for (const w of fresh) queue = enqueue(queue, { op: 'put', id: w.id });
      return { ...state, history: [...state.history, ...fresh], sync: { ...state.sync, queue } };
    }
    case 'routineSave': {
      const routine = { ...action.routine, updatedAt: action.now };
      const exists = state.routines.some((r) => r.id === routine.id);
      return {
        ...state,
        routines: exists ? state.routines.map((r) => (r.id === routine.id ? routine : r)) : [...state.routines, routine],
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', kind: 'routine', id: routine.id }) },
      };
    }
    case 'routineArchive': {
      const r = state.routines.find((x) => x.id === action.id);
      return r ? reducer(state, { type: 'routineSave', routine: { ...r, archived: true }, now: action.now }) : state;
    }
    case 'exerciseSave': {
      const exercise: Exercise = { ...action.exercise, custom: true, updatedAt: action.now };
      const exists = state.customExercises.some((e) => e.id === exercise.id);
      return {
        ...state,
        customExercises: exists
          ? state.customExercises.map((e) => (e.id === exercise.id ? exercise : e))
          : [...state.customExercises, exercise],
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', kind: 'customExercises', id: CUSTOM_ID }) },
      };
    }
    case 'historyUpdate': {
      const w = action.workout;
      if (!state.history.some((h) => h.id === w.id)) return state;
      return {
        ...state,
        history: state.history.map((h) => (h.id === w.id ? w : h)),
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', id: w.id }) },
      };
    }
    case 'remoteMerge': {
      const { remote } = action;
      const q = state.sync.queue;
      const routines = mergeVersioned(state.routines, remote.routines, (id) => isPending(q, 'routine', id));
      const customExercises = remote.customExercises
        ? mergeVersioned(state.customExercises, remote.customExercises, () => isPending(q, 'customExercises', CUSTOM_ID))
        : state.customExercises;
      // a pin still waiting to sync is newer than the copy we pulled, so a plain newest-wins merge keeps it
      const videos = remote.videos ? mergeKeyed(state.videos, remote.videos) : state.videos;
      return { ...state, routines, customExercises, videos, remoteShas: { ...state.remoteShas, ...remote.shas } };
    }
    case 'aiSettings':
      return { ...state, ai: { ...state.ai, ...action.ai } };
    case 'aiUsage': {
      const s = state.ai.spent;
      const u = action.usage;
      const spent = {
        ...s,
        calls: s.calls + 1,
        usd: s.usd + costUsd(action.model, u),
        input: s.input + u.input + u.cacheRead + u.cacheWrite,
        output: s.output + u.output,
      };
      return { ...state, ai: { ...state.ai, spent } };
    }
    case 'aiUsageReset':
      return { ...state, ai: { ...state.ai, spent: emptySpent(action.now) } };
    case 'videoPin':
      return {
        ...state,
        videos: { ...state.videos, [action.exerciseId]: { url: action.url, updatedAt: action.now } },
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', kind: 'videos', id: VIDEOS_ID }) },
      };
  }
}

interface Ctx {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  // Keep getExercise() aware of custom exercises before anything below renders.
  setCustomExercises(state.customExercises);
  useEffect(() => {
    try {
      const { history, active, settings, sync, prefs, rest, hold, routines, customExercises, remoteShas, videos, ai } = state;
      localStorage.setItem(
        KEY,
        JSON.stringify({
          history,
          active,
          settings,
          prefs,
          rest,
          hold,
          routines,
          customExercises,
          remoteShas,
          videos,
          ai,
          sync: { queue: sync.queue, lastSync: sync.lastSync },
        }),
      );
    } catch {
      /* storage full or unavailable */
    }
  }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
