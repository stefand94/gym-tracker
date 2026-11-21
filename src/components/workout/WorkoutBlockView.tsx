import type { WorkoutBlock } from '../../types';
import { CollapsedBlock } from './CollapsedBlock';
import type { Update } from './shared';
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
  /** Open the reorder sheet. */
  onReorder: () => void;
}

/** One block of the workout in progress: collapsed to rows, a single exercise, or a superset. */
export function WorkoutBlockView(props: BlockProps) {
  if (!props.open) return <CollapsedBlock {...props} />;
  return props.block.superset ? <SupersetBlock {...props} /> : <SingleBlock {...props} />;
}
