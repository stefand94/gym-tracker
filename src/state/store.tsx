import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { Workout } from '../types';

export interface SyncSettings {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export type QueueOp = { op: 'put'; id: string } | { op: 'delete'; id: string; path: string };

export interface SyncState {
  queue: QueueOp[];
  lastSync?: string;
  error?: string;
  busy: boolean;
}

export interface State {
  history: Workout[];
  active: Workout | null;
  settings: SyncSettings;
  sync: SyncState;
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
  | { type: 'restore'; history: Workout[] };

const KEY = 'gym-tracker:v1';

const DEFAULT_SETTINGS: SyncSettings = {
  token: '',
  owner: 'stefand94',
  repo: 'gym-tracker-data',
  branch: 'main',
};

function load(): State {
  const base: State = {
    history: [],
    active: null,
    settings: DEFAULT_SETTINGS,
    sync: { queue: [], busy: false },
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
    };
  } catch {
    return base;
  }
}

function sameOp(a: QueueOp, b: QueueOp) {
  return a.op === b.op && a.id === b.id;
}

function enqueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  return [...queue.filter((q) => q.id !== op.id), op];
}

function reducer(state: State, action: Action): State {
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
        history: [...state.history.filter((w) => w.id !== done.id), done],
        sync: { ...state.sync, queue: enqueue(state.sync.queue, { op: 'put', id: done.id }) },
      };
    }
    case 'discard':
      return { ...state, active: null };
    case 'delete': {
      const queue = state.sync.queue.filter((q) => q.id !== action.id);
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
      const deleting = new Set(state.sync.queue.filter((q) => q.op === 'delete').map((q) => q.id));
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
    case 'restore': {
      const known = new Set(state.history.map((w) => w.id));
      const fresh = action.history.filter((w) => w.finishedAt && !known.has(w.id));
      let queue = state.sync.queue;
      for (const w of fresh) queue = enqueue(queue, { op: 'put', id: w.id });
      return { ...state, history: [...state.history, ...fresh], sync: { ...state.sync, queue } };
    }
  }
}

interface Ctx {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      const { history, active, settings, sync } = state;
      localStorage.setItem(
        KEY,
        JSON.stringify({ history, active, settings, sync: { queue: sync.queue, lastSync: sync.lastSync } }),
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
