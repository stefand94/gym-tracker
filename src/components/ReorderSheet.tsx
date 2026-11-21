import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Sortable from 'sortablejs';
import { AREA_LABELS } from '../lib/rehab';
import { moveBlock, moveBlocks, shiftInBlock, standAlone } from '../lib/workout';
import type { RehabArea } from '../types';
import { IconChevronUp, IconGrip } from './Icons';
import { Sheet } from './Sheet';

/** What the reorder sheet works on: blocks of named exercises. */
export interface ReorderBlock {
  id: string;
  superset: boolean;
  rehabDose?: RehabArea;
  items: { id: string; name: string }[];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Default marks: numbers for single exercises, letters for supersets, the rehab dose left out of the count. */
export function defaultMark(blocks: ReorderBlock[], index: number): string {
  const n = blocks.slice(0, index).filter((b) => !b.rehabDose).length;
  return blocks[index].superset ? LETTERS[n % 26] : String(n + 1);
}

const sig = (bs: ReorderBlock[]) => bs.map((b) => `${b.superset ? 'S' : ''}${b.items.map((i) => i.id).join(',')}`).join('|');

/**
 * Reorder a workout or routine in a plain list: drag a row by its grip (SortableJS, which scrolls the sheet when you
 * hold a row near its top or bottom edge), tap ↑ / ↓, or use the arrow keys on the grip; put exercises together with
 * each one's Superset menu. Closing the sheet keeps the changes; Cancel throws them away.
 */
export function ReorderSheet({
  blocks: initial,
  markOf = defaultMark,
  onDone,
  onClose,
}: {
  blocks: ReorderBlock[];
  markOf?: (blocks: ReorderBlock[], index: number) => string;
  /** Called with the new arrangement when it differs from the one the sheet opened with. */
  onDone: (blocks: ReorderBlock[]) => void;
  onClose: () => void;
}) {
  const [blocks, setBlocks] = useState(initial);
  const listRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  const finish = () => {
    if (!cancelled.current && sig(blocks) !== sig(initial)) onDone(blocks);
    onClose();
  };

  // Drag to move. Sortable moves the DOM node; we put it back and let React re-render from state, so React stays
  // the only one rearranging the list.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sortable = Sortable.create(list, {
      handle: '.ro-grip',
      draggable: '.ro-block',
      animation: 150,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 3,
      scroll: list.closest<HTMLElement>('.sheet') ?? true,
      scrollSensitivity: 90,
      scrollSpeed: 14,
      bubbleScroll: true,
      ghostClass: 'ro-ghost',
      chosenClass: 'ro-chosen',
      dragClass: 'ro-dragging',
      onStart: () => {
        navigator.vibrate?.(10);
        document.body.classList.add('dragging');
      },
      onEnd: (e) => {
        document.body.classList.remove('dragging');
        const { oldIndex, newIndex, item, from } = e;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        from.removeChild(item);
        from.insertBefore(item, from.children[oldIndex] ?? null);
        setBlocks((bs) => moveBlock(bs, oldIndex, newIndex));
      },
    });
    return () => {
      sortable.destroy();
      document.body.classList.remove('dragging');
    };
  }, []);

  const onGripKey = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setBlocks((bs) => moveBlock(bs, index, index + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  const label = (b: ReorderBlock, i: number) =>
    b.rehabDose
      ? `${AREA_LABELS[b.rehabDose]} dose`
      : b.superset
        ? `Superset ${markOf(blocks, i)}: ${b.items.map((x) => x.name).join(' + ')}`
        : b.items[0].name;

  /** The Superset menu's choice for an exercise: '' = on its own, else the block it's with (or to join). */
  const choose = (itemId: string, value: string) => {
    if (!value) return setBlocks((bs) => standAlone(bs, itemId));
    setBlocks((bs) => moveBlocks(bs, [itemId], { join: value }));
  };

  const supersetMenu = (block: ReorderBlock, itemId: string, name: string) => {
    if (block.rehabDose) return null;
    const targets = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.id !== block.id && !b.rehabDose);
    const inSs = block.superset && block.items.length > 1;
    return (
      <label className="ro-ss">
        <span className="ro-ss-label">Superset</span>
        <select
          aria-label={`Superset ${name} with`}
          value={inSs ? block.id : ''}
          onChange={(e) => choose(itemId, e.target.value)}
          disabled={!targets.length && !inSs}
        >
          <option value="">{inSs ? 'Take it out (on its own)' : 'None (on its own)'}</option>
          {inSs && <option value={block.id}>{`Superset ${markOf(blocks, blocks.indexOf(block))}`}</option>}
          {targets.map(({ b, i }) => (
            <option key={b.id} value={b.id}>
              {b.superset ? `Join superset ${markOf(blocks, i)} (${b.items.map((x) => x.name).join(' + ')})` : `With ${b.items[0].name}`}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const arrows = (name: string, up?: () => void, down?: () => void) => (
    <span className="ro-arrows">
      <button type="button" className="icon-btn ro-arrow" aria-label={`Move ${name} up`} disabled={!up} onClick={up}>
        <IconChevronUp />
      </button>
      <button type="button" className="icon-btn ro-arrow down" aria-label={`Move ${name} down`} disabled={!down} onClick={down}>
        <IconChevronUp />
      </button>
    </span>
  );

  return (
    <Sheet title="Reorder & supersets" onClose={finish} tall>
      <p className="small dim ro-hint">Drag ⋮⋮ or tap the arrows to move. Pick a partner in Superset to pair exercises up.</p>
      <div className="ro-list" ref={listRef} data-noswipe>
        {blocks.map((b, i) => {
          const mark = markOf(blocks, i);
          const up = i > 0 ? () => setBlocks((bs) => moveBlock(bs, i, i - 1)) : undefined;
          const down = i < blocks.length - 1 ? () => setBlocks((bs) => moveBlock(bs, i, i + 1)) : undefined;
          const grip = (
            <button type="button" className="grip ro-grip" aria-label={`Drag ${label(b, i)}`} onKeyDown={(e) => onGripKey(e, i)}>
              <IconGrip />
            </button>
          );
          const multi = b.items.length > 1;
          return (
            <div key={b.id} className={'ro-block' + (b.superset && multi ? ' ro-ss-block' : '') + (b.rehabDose ? ' ro-dose' : '')}>
              {multi || b.rehabDose ? (
                <>
                  <div className="ro-row ro-head">
                    {grip}
                    <span className="ro-title">{b.rehabDose ? `${AREA_LABELS[b.rehabDose]} daily dose` : `Superset ${mark}`}</span>
                    {arrows(label(b, i), up, down)}
                  </div>
                  {b.items.map((it, k) => (
                    <div key={it.id} className="ro-member">
                      <div className="ro-row">
                        <span className="ro-mark">{b.superset ? `${mark}${k + 1}` : '·'}</span>
                        <span className="ro-name">{it.name}</span>
                        {!b.rehabDose &&
                          arrows(
                            it.name,
                            k > 0 ? () => setBlocks((bs) => shiftInBlock(bs, it.id, -1)) : undefined,
                            k < b.items.length - 1 ? () => setBlocks((bs) => shiftInBlock(bs, it.id, 1)) : undefined,
                          )}
                      </div>
                      {supersetMenu(b, it.id, it.name)}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="ro-row">
                    {grip}
                    <span className="ro-mark">{mark}</span>
                    <span className="ro-name">{b.items[0].name}</span>
                    {arrows(b.items[0].name, up, down)}
                  </div>
                  {supersetMenu(b, b.items[0].id, b.items[0].name)}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="ro-actions">
        <button
          type="button"
          className="btn btn-ghost grow"
          onClick={() => {
            cancelled.current = true;
            onClose();
          }}
        >
          Cancel
        </button>
        <button type="button" className="btn btn-primary grow" onClick={finish}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
