import type { MuscleId } from './data/muscles';

export type ExerciseType = 'weight' | 'bodyweight' | 'timed' | 'machine';

export interface ExerciseDefaults {
  sets: number;
  reps?: number;
  seconds?: number;
  weight?: number;
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
}

export interface RoutineItem {
  exerciseId: string;
  sets?: number;
  reps?: number;
  seconds?: number;
  weight?: number;
  /** Ask for a 0–10 pain score on this exercise (rehab work). */
  trackPain?: boolean;
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
  /** Weekdays it's scheduled for ("mon" … "sun"). Today's routine is shown first on Home. */
  days?: ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[];
  /** Marks a rehab phase routine. */
  rehab?: { area: RehabArea; phase: number };
  blocks: RoutineBlock[];
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
}

export interface WorkoutBlock {
  id: string;
  superset: boolean;
  items: WorkoutItem[];
}

export interface Workout {
  id: string;
  routineId?: string;
  name: string;
  startedAt: string;
  finishedAt?: string;
  blocks: WorkoutBlock[];
}
