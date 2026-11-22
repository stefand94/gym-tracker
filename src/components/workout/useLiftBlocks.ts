import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import Sortable from 'sortablejs';

/**
 * Drag a block by its ⋮⋮ grip (`.wo-grip`) to move it, right on the workout page: the same SortableJS set-up as the
 * reorder sheet (the drag starts on touch; the grip has `touch-action: none`, so the page doesn't scroll instead).
 * When it's picked up, every block folds to a one-line row (`onLift(true)`) and the page scrolls so the row is under
 * your finger; near the top or bottom edge the page scrolls by itself. Let go and the block moves there (`onMove`),
 * the cards open again, and the page is put back so the moved block stays where you dropped it.
 *
 * The grip must stay the same DOM element while the cards fold: iOS stops sending touch moves to the page when the
 * touched element is removed. Sortable moves the DOM node while dragging; on drop we put it back and let React
 * re-render from state, so React stays the only one rearranging the list.
 */
export function useLiftBlocks(
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onLift: (lifted: boolean) => void,
  onMove: (from: number, to: number) => void,
) {
  const cb = useRef({ onLift, onMove });
  cb.current = { onLift, onMove };
  /** After a drop: the moved block and where its row was on screen, to keep it there once the cards reopen. */
  const anchor = useRef<{ el: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    window.scrollBy(0, a.el.getBoundingClientRect().top - a.top);
  });

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
      onChoose: (e) => {
        const ev = (e as unknown as { originalEvent?: TouchEvent | MouseEvent }).originalEvent;
        const fingerY = ev && 'touches' in ev ? ev.touches[0]?.clientY : ev?.clientY;
        navigator.vibrate?.(10);
        swallowUntil = Infinity;
        document.body.classList.add('lifting');
        // fold everything now, before Sortable copies the row to follow your finger
        flushSync(() => cb.current.onLift(true));
        const r = e.item.getBoundingClientRect();
        const want = (fingerY ?? r.top + r.height / 2) - r.height / 2;
        window.scrollBy(0, r.top - want);
        // the page can't always scroll far enough: the copy makes up the rest
        sortable.option('fallbackOffset', { x: 0, y: want - e.item.getBoundingClientRect().top });
      },
      onUnchoose: (e) => {
        // only once something was picked up (and Sortable says this once per touch)
        if (!document.body.classList.contains('lifting')) return;
        anchor.current = { el: e.item, top: e.item.getBoundingClientRect().top };
        document.body.classList.remove('lifting');
        swallowUntil = Date.now() + 500;
        cb.current.onLift(false);
      },
      onEnd: (e) => {
        const { oldIndex, newIndex, item, from } = e;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        cb.current.onMove(oldIndex, newIndex);
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
