import { getExercise } from '../../data/library';
import { blockComplete } from '../../lib/workout';
import type { WorkoutBlock } from '../../types';
import { CollapsedBlock } from './CollapsedBlock';
import { blockLetter, type Update } from './shared';
import { SingleBlock } from './SingleBlock';
import { SupersetBlock } from './SupersetBlock';

export interface BlockProps {
  block: WorkoutBlock;
  index: number;
  update: Update;
  /** Shown in full (true) or as one-line rows (false). */
  open: boolean;
  /** The block you're on now. */
  current: boolean;
  onToggle: () => void;
}

/** A block while you're moving one: a single row with its mark and exercise names. */
function LiftRow({ block, index }: { block: WorkoutBlock; index: number }) {
  const names = block.items.map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId);
  return (
    <div className={'crow lift-row' + (blockComplete(block) ? ' lift-done' : '') + (block.superset ? ' lift-ss' : '')}>
      <span className="crow-mark">{block.superset ? blockLetter(index) : index + 1}</span>
      <span className="crow-stack">
        {names.map((n, k) => (
          <span key={k} className="crow-name">
            {n}
          </span>
        ))}
      </span>
    </div>
  );
}

/** One block of the workout in progress: collapsed to rows, a single exercise, or a superset. */
export function WorkoutBlockView(props: BlockProps & { lifting?: boolean }) {
  if (props.lifting) return <LiftRow block={props.block} index={props.index} />;
  if (!props.open) return <CollapsedBlock {...props} />;
  return props.block.superset ? <SupersetBlock {...props} /> : <SingleBlock {...props} />;
}
