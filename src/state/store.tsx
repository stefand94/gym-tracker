import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { setCustomExercises } from '../data/library';
import { load, save } from './persist';
import { reducer } from './reducer';
import type { Action, State } from './types';

// The store is split by concern: `types` (state and actions), `reducer`, `queue` (the sync queue) and `persist`
// (localStorage). Import from here.
export * from './types';
export { CUSTOM_ID, isPending } from './queue';
export { load } from './persist';
export { reducer } from './reducer';

interface Ctx {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  // Keep getExercise() aware of custom exercises before anything below renders.
  setCustomExercises(state.customExercises);
  useEffect(() => save(state), [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
