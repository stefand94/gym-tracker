import { useState } from 'react';
import type { AskFrom } from '../lib/ask';
import type { RoutineBlock } from '../types';
import { useStore } from '../state/store';
import { useClaude } from '../state/useClaude';
import { AskSheet } from './AskSheet';
import { IconSpark } from './Icons';

/**
 * The one way to ask Claude: a ✦ button in each screen's top bar that opens the Ask chat with what that screen is
 * about (the routine being edited, the workout in progress, or the whole history). Hidden until a key is set.
 */
export function ClaudeButton({
  from,
  boxed,
  onUseInEditor,
}: {
  /** Defaults to the workout in progress, else Home's view of everything. */
  from?: AskFrom;
  /** The workout header's boxed look, next to the timer. */
  boxed?: boolean;
  onUseInEditor?: (name: string, blocks: RoutineBlock[]) => void;
}) {
  const { state } = useStore();
  const { ready } = useClaude();
  const [open, setOpen] = useState(false);
  if (!ready) return null;
  const ctx: AskFrom = from ?? (state.active ? { kind: 'workout', workout: state.active } : { kind: 'home' });
  return (
    <>
      <button className={'icon-btn claude-btn' + (boxed ? ' icon-btn-box' : '')} aria-label="Ask Claude" onClick={() => setOpen(true)}>
        <IconSpark />
      </button>
      {open && <AskSheet from={ctx} onClose={() => setOpen(false)} onUseInEditor={onUseInEditor} />}
    </>
  );
}
