import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../../state/store';
import type { Workout } from '../../types';

/** Make a change to the workout that can be taken back from a toast: `label` says what happened ("Replaced …"). */
export type Undoable = (label: string, fn: (w: Workout) => Workout) => void;

const UndoContext = createContext<Undoable | null>(null);

const SHOW_MS = 6000;

/**
 * Mid-set slips (replace, superset, remove, skip, a drag) get one level of undo. The toast only stays while the workout
 * is exactly as that change left it: tick a set or change anything else and it goes, so Undo never throws away later work.
 */
export function UndoProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const [last, setLast] = useState<{ label: string; before: Workout; after: Workout } | null>(null);

  const run = useCallback<Undoable>(
    (label, fn) => {
      const before = state.active;
      if (!before) return;
      const after = fn(before);
      if (after === before) return;
      dispatch({ type: 'updateActive', fn: () => after });
      setLast({ label, before, after });
    },
    [state.active, dispatch],
  );

  const showing = !!last && state.active === last.after;
  useEffect(() => {
    if (!showing) return;
    const t = setTimeout(() => setLast(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [showing, last]);

  return (
    <UndoContext.Provider value={run}>
      {children}
      {showing && (
        <div className="undo-toast" role="status">
          <span className="grow truncate">{last.label}</span>
          <button
            type="button"
            className="undo-btn"
            onClick={() => {
              dispatch({ type: 'updateActive', fn: () => last.before });
              setLast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}

/** The undoable update for the workout screen (falls back to a plain update outside the provider). */
export function useUndoable(): Undoable {
  const run = useContext(UndoContext);
  const { dispatch } = useStore();
  return run ?? ((_label, fn) => dispatch({ type: 'updateActive', fn }));
}
