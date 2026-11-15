import { useState } from 'react';
import { getExercise } from '../../data/library';
import { fmtNum, fmtSet } from '../../lib/format';
import { stallText } from '../../lib/stall';
import { changeReps, dismissStall, repSchemes, replaceItem, resetSets, resetStalled, routineWithScheme } from '../../lib/workout';
import { useStore } from '../../state/store';
import type { Exercise, Workout, WorkoutItem } from '../../types';
import { ExercisePicker } from '../ExercisePicker';
import { Sheet } from '../Sheet';
import type { Update } from './shared';

/** The fixes for a stuck exercise: reset the weight, change the reps (saved to the routine), swap it, or not now. */
export function StallSheet({ ex, item, update, onClose }: { ex: Exercise; item: WorkoutItem; update: Update; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [swapping, setSwapping] = useState(false);
  const act = (fn: (w: Workout) => Workout) => {
    update(fn);
    onClose();
  };
  const routine = state.routines.find((r) => r.id === state.active?.routineId && !r.archived);
  if (!item.stall) return null;
  if (swapping)
    return (
      <ExercisePicker
        title={`Swap ${ex.name}`}
        similarTo={ex}
        onClose={onClose}
        onPick={(next) => act((w) => replaceItem(w, item.id, next, state.history))}
      />
    );
  const reset = resetSets(ex, item).find((s) => !s.done);
  return (
    <Sheet title={`${ex.name}: ${stallText(item.stall)}`} onClose={onClose}>
      {reset && (
        <button className="menu-item two-line" onClick={() => act((w) => resetStalled(w, item.id, getExercise))}>
          <span>Reset to {fmtSet(ex, reset)}</span>
          <span className="menu-sub">A lighter week, then go-up builds it back</span>
        </button>
      )}
      {repSchemes(ex, item).map((s) => {
        const saved = routine && routineWithScheme(routine, ex.id, s);
        return (
          <button
            key={s.reps}
            className="menu-item two-line"
            onClick={() => {
              if (saved) dispatch({ type: 'routineSave', routine: saved, now: new Date().toISOString() });
              act((w) => changeReps(w, item.id, s, getExercise));
            }}
          >
            <span>
              {s.sets} × {s.reps} at {fmtNum(s.weight)} kg
            </span>
            <span className="menu-sub">
              {s.reps < (item.stall?.target ?? 8) ? 'Heavier, fewer reps' : 'Lighter, more reps'} ·{' '}
              {saved ? `saved to ${routine.name}` : 'this session only'}
            </span>
          </button>
        );
      })}
      <button className="menu-item two-line" onClick={() => setSwapping(true)}>
        <span>Swap for a similar exercise</span>
        <span className="menu-sub">Same muscles, a fresh start</span>
      </button>
      <button className="menu-item" onClick={() => act((w) => dismissStall(w, item.id))}>
        Not now
      </button>
    </Sheet>
  );
}
