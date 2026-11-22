import { useEffect, useRef, type RefObject } from 'react';
import Sortable from 'sortablejs';

/**
 * Drag a block by its ⋮⋮ grip (`.wo-grip`) to move it, right on the workout page: the same SortableJS set-up as the
 * reorder sheet (the drag starts on touch; the grip has `touch-action: none`, so the page doesn't scroll instead).
 * The page stays as it is: the block you picked up stays in place, faded, as the spot it will land in, and a short copy
 * of its top follows your finger; near the top or bottom edge the page scrolls by itself. Let go and the block moves
 * there (`onMove`).
 *
 * Sortable moves the DOM node while dragging; on drop we put it back and let React re-render from state, so React stays
 * the only one rearranging the list.
 */
export function useLiftBlocks(listRef: RefObject<HTMLElement | null>, enabled: boolean, onMove: (from: number, to: number) => void) {
  const cb = useRef(onMove);
  cb.current = onMove;

  useEffect(() => {
    const list = listRef.current;
    if (!list || !enabled) return;
    /** The click that follows letting go would fold or open a card: swallow it. */
    let swallowUntil = 0;
    const eatClick = (e: MouseEvent) => {
      if (Date.now() < swallowUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const noMenu = (e: Event) => {
      if (document.body.classList.contains('lifting')) e.preventDefault();
    };
    document.addEventListener('click', eatClick, true);
    document.addEventListener('contextmenu', noMenu, true);

    const sortable = Sortable.create(list as HTMLElement, {
      handle: '.wo-grip',
      draggable: '.wo-block',
      animation: 150,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      scroll: true,
      scrollSensitivity: 110,
      scrollSpeed: 16,
      bubbleScroll: true,
      ghostClass: 'wo-ghost',
      chosenClass: 'wo-chosen',
      dragClass: 'wo-dragging',
      onChoose: () => {
        navigator.vibrate?.(10);
        swallowUntil = Infinity;
        document.body.classList.add('lifting');
      },
      onUnchoose: () => {
        // only once something was picked up (and Sortable says this once per touch)
        if (!document.body.classList.contains('lifting')) return;
        document.body.classList.remove('lifting');
        swallowUntil = Date.now() + 500;
      },
      onEnd: (e) => {
        const { oldIndex, newIndex, item, from } = e;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        cb.current(oldIndex, newIndex);
      },
    });
    return () => {
      sortable.destroy();
      document.body.classList.remove('lifting');
      document.removeEventListener('click', eatClick, true);
      document.removeEventListener('contextmenu', noMenu, true);
    };
  }, [listRef, enabled]);
}
