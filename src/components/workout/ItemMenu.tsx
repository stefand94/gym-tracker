import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExercise } from '../../data/library';
import {
  addExercise,
  removeItem,
  removeSet,
  replaceItem,
  standAlone,
  supersetTargets,
  supersetWith,
  toggleSkip,
  toggleTrackPain,
  toggleWarmups,
} from '../../lib/workout';
import { useStore } from '../../state/store';
import type { Exercise, Workout, WorkoutBlock, WorkoutItem } from '../../types';
import { ExercisePicker } from '../ExercisePicker';
import { HowToSheet } from '../HowToSheet';
import { IconChart, IconInfo, IconLink, IconNote, IconSwap } from '../Icons';
import { Sheet } from '../Sheet';
import { blockLetter, type Update } from './shared';
import { useUndoable } from './useUndo';

const names = (b: WorkoutBlock) => b.items.map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId).join(' + ');

/** Pick what to superset an exercise with: anything else in the workout, or a new exercise from the library. */
function SupersetPicker({ ex, item, onClose }: { ex: Exercise; item: WorkoutItem; onClose: () => void }) {
  const { state } = useStore();
  const undoable = useUndoable();
  const [adding, setAdding] = useState(false);
  const w = state.active;
  if (!w) return null;
  const targets = supersetTargets(w, item.id);
  const pick = (label: string, fn: (w: Workout) => Workout) => {
    undoable(label, fn);
    onClose();
  };
  if (adding)
    return (
      <ExercisePicker
        title={`Superset with ${ex.name}`}
        onClose={onClose}
        onPick={(next) =>
          pick(`Superset ${ex.name} with ${next.name}`, (x) => {
            const added = addExercise(x, next, state.history);
            const fresh = added.blocks[added.blocks.length - 1];
            return supersetWith(added, item.id, fresh.id);
          })
        }
      />
    );
  return (
    <Sheet title={`Superset ${ex.name} with`} onClose={onClose}>
      {targets.map((b) => {
        const at = w.blocks.indexOf(b);
        const ss = b.superset && b.items.length > 1;
        return (
          <button
            key={b.id}
            className="menu-item pick-row"
            onClick={() => pick(`Superset ${ex.name} with ${names(b)}`, (x) => supersetWith(x, item.id, b.id))}
          >
            <span className="crow-mark">{b.superset ? blockLetter(at) : at + 1}</span>
            <span className="grow">{ss ? `Join superset ${blockLetter(at)}: ${names(b)}` : names(b)}</span>
          </button>
        );
      })}
      <button className="menu-item pick-row" onClick={() => setAdding(true)}>
        <span className="crow-mark pick-new">+</span>
        <span className="grow">Another exercise…</span>
      </button>
    </Sheet>
  );
}

/**
 * The ⋯ sheet for one exercise. What the card already has buttons for (tick all, + set, skip on a single exercise)
 * isn't repeated here; moving it is done by dragging the card's ⋮⋮ grip.
 */
export function ItemMenu({
  ex,
  item,
  block,
  update,
  onClose,
  onNote,
}: {
  ex: Exercise;
  item: WorkoutItem;
  block: WorkoutBlock;
  update: Update;
  onClose: () => void;
  onNote: () => void;
}) {
  const { state } = useStore();
  const undoable = useUndoable();
  const nav = useNavigate();
  const [sheet, setSheet] = useState<'replace' | 'howto' | 'superset' | null>(null);
  const act = (fn: (w: Workout) => Workout) => {
    update(fn);
    onClose();
  };
  /** A change that's easy to make by mistake mid-set: the toast offers Undo. */
  const undoAct = (label: string, fn: (w: Workout) => Workout) => {
    undoable(label, fn);
    onClose();
  };
  if (sheet === 'replace')
    return (
      <ExercisePicker
        title="Replace exercise"
        similarTo={ex}
        onClose={onClose}
        onPick={(next) => undoAct(`Swapped ${ex.name} for ${next.name}`, (w) => replaceItem(w, item.id, next, state.history))}
      />
    );
  if (sheet === 'howto') return <HowToSheet ex={ex} onClose={onClose} />;
  if (sheet === 'superset') return <SupersetPicker ex={ex} item={item} onClose={onClose} />;

  const inSuperset = block.superset && block.items.length > 1;
  const warmable = (ex.type === 'weight' || ex.type === 'machine') && !/assist/i.test(ex.weightNote ?? '');
  const canPair = !!state.active && !block.rehabDose;
  return (
    <Sheet title={ex.name} onClose={onClose}>
      <div className="menu-tiles">
        <button
          className="menu-tile tile-note"
          onClick={() => {
            onClose();
            onNote();
          }}
        >
          <IconNote />
          {item.note ? 'Note' : 'Add note'}
        </button>
        <button className="menu-tile" onClick={() => setSheet('howto')}>
          <IconInfo />
          How to
        </button>
        <button className="menu-tile" onClick={() => setSheet('replace')}>
          <IconSwap />
          Replace
        </button>
        <button
          className="menu-tile"
          onClick={() => {
            onClose();
            nav(`/progress/${ex.id}`);
          }}
        >
          <IconChart />
          Progress
        </button>
      </div>

      {canPair && (
        <button className="menu-item" onClick={() => setSheet('superset')}>
          <IconLink />
          {inSuperset ? 'Add to this superset…' : 'Superset with…'}
        </button>
      )}
      {inSuperset && (
        <button
          className="menu-item"
          onClick={() => undoAct(`Took ${ex.name} out of the superset`, (w) => ({ ...w, blocks: standAlone(w.blocks, item.id) }))}
        >
          Take out of superset
        </button>
      )}
      <button
        className="menu-item"
        disabled={item.sets.length <= 1}
        onClick={() => undoAct(`Removed set ${item.sets.length} of ${ex.name}`, (w) => removeSet(w, item.id))}
      >
        Remove last set
      </button>
      {warmable && (
        <button className="menu-item" onClick={() => act((w) => toggleWarmups(w, item.id, getExercise))}>
          {item.warmups?.length ? 'Remove warm-up sets' : 'Add warm-up sets'}
        </button>
      )}
      <button className="menu-item" onClick={() => act((w) => toggleTrackPain(w, item.id))}>
        {item.trackPain ? 'Stop logging pain' : 'Log pain'}
      </button>
      {block.superset && (
        <button
          className="menu-item"
          onClick={() => undoAct(`${item.status === 'skipped' ? 'Unskipped' : 'Skipped'} ${ex.name}`, (w) => toggleSkip(w, item.id))}
        >
          {item.status === 'skipped' ? 'Unskip exercise' : 'Skip exercise'}
        </button>
      )}

      <div className="menu-section menu-gap" />
      <button className="menu-item danger" onClick={() => undoAct(`Removed ${ex.name}`, (w) => removeItem(w, item.id))}>
        Remove from workout
      </button>
    </Sheet>
  );
}
