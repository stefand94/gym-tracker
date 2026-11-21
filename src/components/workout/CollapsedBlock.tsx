import { getExercise } from '../../data/library';
import { itemSummary } from '../../lib/format';
import { blockComplete } from '../../lib/workout';
import { blockLetter } from './shared';
import type { BlockProps } from './WorkoutBlockView';

/** A block shown as one-line rows: finished exercises with their summary, or an exercise still to come. */
export function CollapsedBlock({ block, index, onToggle }: BlockProps) {
  const complete = blockComplete(block);
  const letter = blockLetter(index);
  if (!complete) {
    const names = block.items.map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId).join(' + ');
    const first = block.items[0];
    const sub = block.superset
      ? `Superset · ${Math.max(...block.items.map((i) => i.sets.length))} rounds`
      : itemSummary(getExercise(first.exerciseId), first);
    return (
      <button type="button" className="crow crow-next" onClick={onToggle} aria-expanded={false}>
        <span className="crow-mark">{block.superset ? letter : index + 1}</span>
        <span className="crow-name">{names}</span>
        <span className="crow-sum num">{sub}</span>
      </button>
    );
  }
  return (
    <div className="crow-group">
      {block.items.map((item, n) => {
        const ex = getExercise(item.exerciseId);
        const skipped = item.status === 'skipped';
        return (
          <button key={item.id} type="button" className={'crow' + (skipped ? ' crow-skip' : '')} onClick={onToggle}>
            <span className="crow-mark">{skipped ? '–' : '✓'}</span>
            <span className="crow-name">
              {block.superset && <span className="ss-tag">{`${letter}${n + 1} `}</span>}
              {ex?.name ?? item.exerciseId}
            </span>
            <span className="crow-sum num">{itemSummary(ex, item)}</span>
          </button>
        );
      })}
    </div>
  );
}
