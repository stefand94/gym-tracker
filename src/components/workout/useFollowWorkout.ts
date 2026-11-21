import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { blockComplete, workoutProgress } from '../../lib/workout';
import type { Workout } from '../../types';

/**
 * Keeps the workout screen on what you're doing:
 * - opening the workout jumps to the current block;
 * - finishing a block scrolls to the next one (and tells the screen, which folds the finished one);
 * - after any other tick, if the next set is hidden behind the header (rest bar) or the bottom nav, it's brought to
 *   the middle of the screen. A set that's already in view doesn't move the page.
 */
export function useFollowWorkout(
  w: Workout | null,
  cur: number,
  headRef: RefObject<HTMLElement | null>,
  onBlocksDone: (ids: string[]) => void,
) {
  const curId = w && cur >= 0 ? w.blocks[cur].id : null;

  const scrollToBlock = useCallback(
    (id: string, smooth = true) => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`blk-${id}`);
        if (!el) return;
        const head = headRef.current?.getBoundingClientRect().height ?? 0;
        const top = el.getBoundingClientRect().top + window.scrollY - head - 10;
        window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
      });
    },
    [headRef],
  );

  // Coming back to the workout: jump straight to where you are (once, on arrival).
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (landed.current || !w) return;
    landed.current = true;
    if (!curId || cur === 0) return;
    // after App's scroll-to-top on route change
    setTimeout(() => scrollToBlock(curId, false), 0);
  }, [w, curId, cur, scrollToBlock]);

  // A block was finished: move to the next one.
  const doneKey = w
    ? w.blocks
        .filter(blockComplete)
        .map((b) => b.id)
        .join(',')
    : '';
  const prevDone = useRef<Set<string> | null>(null);
  /** Set when the screen is moving to the next block, so the set-follow below leaves that tick alone. */
  const jumped = useRef(false);
  useEffect(() => {
    const now = new Set(doneKey ? doneKey.split(',') : []);
    const before = prevDone.current;
    prevDone.current = now;
    if (!before) return;
    const fresh = [...now].filter((id) => !before.has(id));
    if (!fresh.length) return;
    onBlocksDone(fresh);
    jumped.current = true;
    if (curId) scrollToBlock(curId);
  }, [doneKey, curId, scrollToBlock, onBlocksDone]);

  // Any other tick: keep the next set in view.
  const doneSets = w ? workoutProgress(w).done : 0;
  const prevSets = useRef(doneSets);
  useEffect(() => {
    const before = prevSets.current;
    prevSets.current = doneSets;
    const blockChanged = jumped.current;
    jumped.current = false;
    if (doneSets <= before || blockChanged) return;
    // let the rest bar appear first, since it makes the header taller
    const t = setTimeout(() => {
      const row = document.querySelector<HTMLElement>('.set-row.now');
      if (!row) return;
      const r = row.getBoundingClientRect();
      const top = headRef.current?.getBoundingClientRect().bottom ?? 0;
      const nav = document.querySelector('.nav')?.getBoundingClientRect().top ?? window.innerHeight;
      if (r.top >= top + 4 && r.bottom <= nav - 4) return;
      const mid = top + (nav - top) / 2;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top + r.height / 2 - mid), behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, [doneSets, headRef]);
}
