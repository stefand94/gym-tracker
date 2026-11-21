import { useState } from 'react';
import { getExercise } from '../../data/library';
import {
  addSet,
  canSupersetWithNext,
  removeItem,
  removeSet,
  replaceItem,
  splitBlock,
  supersetWithNext,
  toggleComplete,
  toggleSkip,
  toggleTrackPain,
  toggleWarmups,
} from '../../lib/workout';
import { useStore } from '../../state/store';
import type { Exercise, Workout, WorkoutBlock, WorkoutItem } from '../../types';
import { ExercisePicker } from '../ExercisePicker';
import { HowToSheet } from '../HowToSheet';
import { Sheet } from '../Sheet';
import type { Update } from './shared';

/** The ⋯ sheet for one exercise. */
export function ItemMenu({
  ex,
  item,
  block,
  update,
  onClose,
  onNote,
  onReorder,
}: {
  ex: Exercise;
  item: WorkoutItem;
  block: WorkoutBlock;
  update: Update;
  onClose: () => void;
  onNote: () => void;
  onReorder: () => void;
}) {
  const { state } = useStore();
  const [armed, setArmed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const act = (fn: (w: Workout) => Workout) => {
    update(fn);
    onClose();
  };
  if (replacing)
    return (
      <ExercisePicker
        title="Replace exercise"
        similarTo={ex}
        onClose={onClose}
        onPick={(next) => act((w) => replaceItem(w, item.id, next, state.history))}
      />
    );
  if (howTo) return <HowToSheet ex={ex} onClose={onClose} />;
  return (
    <Sheet title={ex.name} onClose={onClose}>
      <button
        className="menu-item"
        onClick={() => {
          onClose();
          onNote();
        }}
      >
        {item.note ? 'Open note' : 'Add a note'}
      </button>
      <button className="menu-item" onClick={() => setHowTo(true)}>
        How to do it
      </button>
      <button className="menu-item" onClick={() => setReplacing(true)}>
        Replace exercise…
      </button>
      <button className="menu-item" onClick={() => act((w) => toggleComplete(w, item.id))}>
        {item.status === 'done' ? 'Untick all sets' : 'Complete all sets'}
      </button>
      <button className="menu-item" onClick={() => act((w) => toggleSkip(w, item.id))}>
        {item.status === 'skipped' ? 'Unskip exercise' : 'Skip exercise'}
      </button>
      <button className="menu-item" onClick={() => act((w) => addSet(w, item.id))}>
        Add a set
      </button>
      <button className="menu-item" onClick={() => act((w) => toggleTrackPain(w, item.id))}>
        {item.trackPain ? 'Stop logging pain' : 'Log pain'}
      </button>
      <button className="menu-item" disabled={item.sets.length <= 1} onClick={() => act((w) => removeSet(w, item.id))}>
        Remove last set
      </button>
      {(ex.type === 'weight' || ex.type === 'machine') && !/assist/i.test(ex.weightNote ?? '') && (
        <button className="menu-item" onClick={() => act((w) => toggleWarmups(w, item.id, getExercise))}>
          {item.warmups?.length ? 'Remove warm-up sets' : 'Add warm-up sets'}
        </button>
      )}
      <button
        className="menu-item"
        onClick={() => {
          onClose();
          onReorder();
        }}
      >
        Reorder & supersets…
      </button>
      <button
        className="menu-item"
        disabled={!state.active || !canSupersetWithNext(state.active, block.id)}
        onClick={() => act((w) => supersetWithNext(w, block.id))}
      >
        Superset with next exercise
      </button>
      {block.superset && (
        <button className="menu-item" onClick={() => act((w) => splitBlock(w, block.id))}>
          Split superset
        </button>
      )}
      <button className="menu-item danger" onClick={() => (armed ? act((w) => removeItem(w, item.id)) : setArmed(true))}>
        {armed ? `Tap again to remove ${ex.name}` : 'Remove from workout'}
      </button>
    </Sheet>
  );
}
