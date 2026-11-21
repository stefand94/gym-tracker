import { costUsd } from '../lib/claude';
import { mergeKeyed, mergeVersioned } from '../lib/merge';
import type { Exercise, Workout } from '../types';
import { emptySpent } from './persist';
import { CUSTOM_ID, enqueue, isPending, kindOf, sameOp, sameTarget, VIDEOS_ID } from './queue';
import type { Action, HoldState, State } from './types';

const HOLD_LEAD_IN = 5;
const REST_MIN = 15;
const REST_MAX = 600;

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
      // New workouts are added; ones changed in the repo replace ours unless we have an unsynced edit of our own.
      const q = state.sync.queue;
      const known = new Set(state.history.map((w) => w.id));
      const deleting = new Set(q.filter((x) => x.op === 'delete' && kindOf(x) === 'workout').map((x) => x.id));
      const pulled = new Map(action.workouts.filter((w) => !deleting.has(w.id)).map((w) => [w.id, w]));
      if (!pulled.size) return state;
      const history = state.history.map((w) => (pulled.has(w.id) && !isPending(q, 'workout', w.id) ? pulled.get(w.id)! : w));
      const fresh = [...pulled.values()].filter((w) => !known.has(w.id));
      return { ...state, history: [...history, ...fresh] };
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
      const goAt = action.now + (action.lead ?? HOLD_LEAD_IN) * 1000;
      const hold: HoldState = { itemId: action.itemId, set: action.set, goAt, endsAt: goAt + action.seconds * 1000 };
      return { ...state, rest: null, hold: action.side ? { ...hold, side: action.side } : hold };
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
    case 'aiCheckIn':
      return { ...state, ai: { ...state.ai, checkIn: action.checkIn } };
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
