import type { CheckIn } from '../lib/helpers';
import type { ModelKey, TokenUsage } from '../lib/claude';
import type { Exercise, Routine, Workout } from '../types';

/** The app's state and the actions that change it (see `reducer.ts`). */

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
  /** This week's check-in on Home, kept so it isn't asked for again on every visit. */
  checkIn?: CheckIn;
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
  /** Which side of a two-sided hold (side plank) is being held. */
  side?: 'L' | 'R';
}

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

export type Action =
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
  | {
      type: 'holdStart';
      itemId: string;
      set: number;
      seconds: number;
      now: number;
      /** get-ready seconds (default HOLD_LEAD_IN) */ lead?: number;
      side?: 'L' | 'R';
    }
  | { type: 'holdStop' }
  | { type: 'routineSave'; routine: Routine; now: string }
  | { type: 'routineArchive'; id: string; now: string }
  | { type: 'exerciseSave'; exercise: Exercise; now: string }
  | { type: 'remoteMerge'; remote: RemoteData }
  | { type: 'videoPin'; exerciseId: string; url: string; now: string }
  | { type: 'aiSettings'; ai: Partial<Pick<AiSettings, 'key' | 'askModel'>> }
  | { type: 'aiUsage'; model: ModelKey; usage: TokenUsage }
  | { type: 'aiUsageReset'; now: string }
  | { type: 'aiCheckIn'; checkIn: CheckIn }
  | { type: 'historyUpdate'; workout: Workout };
