import exercisesJson from './exercises.json';
import routinesJson from './routines.json';
import type { Exercise, Routine } from '../types';

/** Exercises bundled with the app. */
export const EXERCISES = exercisesJson as Exercise[];
/** Starter routines: only a seed — the user's routines live in the store and sync to the data repo. */
export const ROUTINES = routinesJson as Routine[];

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

// Exercises created in the app. The store keeps this registry current so every
// getExercise() caller sees them without threading a lookup through.
let custom: Exercise[] = [];
let customById: Record<string, Exercise> = {};

export function setCustomExercises(list: Exercise[]): void {
  if (list === custom) return;
  custom = list;
  customById = Object.fromEntries(list.map((e) => [e.id, e]));
}

/** Bundled first (a reviewed custom exercise promoted into exercises.json wins), then custom. */
export function getExercise(id: string): Exercise | undefined {
  return EXERCISE_BY_ID[id] ?? customById[id];
}

export function allExercises(): Exercise[] {
  return [...EXERCISES, ...custom.filter((e) => !EXERCISE_BY_ID[e.id])];
}
