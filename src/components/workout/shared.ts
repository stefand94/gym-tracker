import { getExercise } from '../../data/library';
import { recordsIn } from '../../lib/records';
import { useStore } from '../../state/store';
import type { Workout } from '../../types';

export type Update = (fn: (w: Workout) => Workout) => void;

/** Superset letters: A, B, C… by block position. */
export const blockLetter = (index: number) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index % 26];

/** Starts the rest countdown after a tick, when the rest timer is switched on. */
export function useStartRest() {
  const { state, dispatch } = useStore();
  return () => {
    if (state.prefs.rest) dispatch({ type: 'restStart', now: Date.now() });
  };
}

/** The record sets of the workout in progress, by item id. */
export function useRecords(): Map<string, number[]> {
  const { state } = useStore();
  return state.active ? recordsIn(state.active, state.history, getExercise) : new Map();
}
