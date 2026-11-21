import { ROUTINES } from '../data/library';
import type { Routine } from '../types';
import type { AiSettings, Prefs, State, SyncSettings } from './types';

/** Loading and saving the state in localStorage, with defaults for anything missing. */

const KEY = 'gym-tracker:v1';

export const emptySpent = (since = new Date().toISOString()) => ({ calls: 0, usd: 0, input: 0, output: 0, since });
const DEFAULT_AI = (): AiSettings => ({ key: '', askModel: 'haiku', spent: emptySpent() });

const DEFAULT_PREFS: Prefs = { rest: false, restSeconds: 90, restMini: false };

const DEFAULT_SETTINGS: SyncSettings = {
  token: '',
  owner: 'stefand94',
  repo: 'gym-tracker-data',
  branch: 'main',
};

/** Seeds are older than anything synced, so a copy from the data repo always replaces them. */
const SEED_TIME = '2000-01-01T00:00:00.000Z';

/** Add any bundled routine the user doesn't have yet (archived ones keep their id, so they stay gone). */
function withSeedRoutines(routines: Routine[]): Routine[] {
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

/** Everything worth keeping across reloads (not the sync's busy flag or last error). */
export function save(state: State) {
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
}
