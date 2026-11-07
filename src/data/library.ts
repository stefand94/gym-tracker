import exercisesJson from './exercises.json';
import routinesJson from './routines.json';
import type { Exercise, Routine } from '../types';

export const EXERCISES = exercisesJson as Exercise[];
export const ROUTINES = routinesJson as Routine[];

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

export function getExercise(id: string): Exercise | undefined {
  return EXERCISE_BY_ID[id];
}
