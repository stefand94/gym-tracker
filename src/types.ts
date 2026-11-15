import type { MuscleId } from './data/muscles';

export type ExerciseType = 'weight' | 'bodyweight' | 'timed' | 'machine';

export interface ExerciseDefaults {
  sets: number;
  reps?: number;
  seconds?: number;
  weight?: number;
}

/** A short written guide: 3–4 steps and the most common mistake. */
export interface HowTo {
  steps: string[];
  mistake?: string;
}

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  equipment: string;
  /** How the weight is entered, shown as a hint next to the weight field. */
  weightNote?: string;
  /** Short coaching cue shown on the exercise card, e.g. "lower over 4–5 s". */
  cue?: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  defaults: ExerciseDefaults;
  /** Written guide for custom exercises (bundled ones are in data/howto.json). */
  howto?: HowTo;
  /** A specific video to show instead of a YouTube search. */
  video?: string;
  /** Other names people search for, e.g. "lying triceps extension". */
  aliases?: string[];
  /** Created in the app (lives in the data repo's exercises/custom.json). */
  custom?: boolean;
  /** A custom exercise whose muscles/type Claude has checked. */
  reviewed?: boolean;
  updatedAt?: string;
}

export interface RoutineItem {
  exerciseId: string;
  sets?: number;
  reps?: number;
  seconds?: number;
  weight?: number;
  /** Ask for a 0–10 pain score on this exercise (rehab work). */
  trackPain?: boolean;
  /** Machine / cable station to use, e.g. "Upstairs 1". */
  station?: string;
}

export type RehabArea = 'hamstring';

export interface RoutineBlock {
  superset?: boolean;
  /** A rehab "daily dose": swapped for the current phase's dose when the workout starts. */
  rehabDose?: RehabArea;
  items: RoutineItem[];
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  /** No longer used (Home suggests from muscle load instead); kept so old data still type-checks. */
  days?: string[];
  /** Marks a rehab phase routine. */
  rehab?: { area: RehabArea; phase: number };
  blocks: RoutineBlock[];
  /** ISO time of the last edit; the newer copy wins when syncing. */
  updatedAt?: string;
  /** Deleted routines are kept (and synced) as archived so they don't come back. */
  archived?: boolean;
}

export interface SetEntry {
  weight?: number;
  reps?: number;
  seconds?: number;
  done: boolean;
}

export type ItemStatus = 'pending' | 'done' | 'skipped';

export interface WorkoutItem {
  id: string;
  exerciseId: string;
  status: ItemStatus;
  sets: SetEntry[];
  trackPain?: boolean;
  /** 0–10 pain during this exercise. */
  pain?: number;
  /** Machine / cable station it was done on, e.g. "Upstairs 1" (weights differ between stations). */
  station?: string;
  /** Free-text note (typed or dictated), e.g. "left shoulder clicked on the last set". */
  note?: string;
  /** Changes Claude read out of the note, waiting for a tap (accepted ones are applied and removed). */
  noteSuggestions?: NoteSuggestion[];
}

/** One change Claude read out of a note. */
export type NoteSuggestion =
  | { kind: 'pain'; pain: number; label: string }
  | { kind: 'station'; station: string; label: string }
  | { kind: 'sets'; sets: { weight?: number; reps?: number; seconds?: number }[]; label: string }
  | { kind: 'swap'; exerciseId: string; label: string }
  | { kind: 'remember'; text: string; label: string };

export interface WorkoutBlock {
  id: string;
  superset: boolean;
  items: WorkoutItem[];
  /** Came from a routine's rehab dose block (so "update routine" keeps it a dose block). */
  rehabDose?: RehabArea;
}

export interface Workout {
  id: string;
  routineId?: string;
  name: string;
  startedAt: string;
  finishedAt?: string;
  blocks: WorkoutBlock[];
  /** 0–10 pain the morning after (rehab check-in); null = dismissed without answering. */
  nextDayPain?: number | null;
  /** Free-text note about the whole session. */
  note?: string;
}
