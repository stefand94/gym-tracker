import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
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

/** Distance from the sheet's top/bottom edge where a drag starts scrolling it. */
const EDGE = 64;

interface Drag {
  index: number;
  /** Pointer y when the drag started, and the sheet's scroll then. */
  y0: number;
  scroll0: number;
  /** Rows' tops and heights in the sheet's content, at the start. */
  rows: { top: number; height: number }[];
  gap: number;
}

/**
 * Reorder a workout or routine in a plain list that never changes shape under your finger: drag a row by its grip
 * (or ↑ / ↓, or arrow keys on the grip), and put exercises together with each one's Superset menu. Closing the sheet
 * keeps the changes; Cancel throws them away.
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
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Where the dragged row is now: its offset and the index it would land at. */
  const [view, setView] = useState<{ dy: number; to: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pointerY = useRef(0);
  const cancelled = useRef(false);

  const finish = () => {
    if (!cancelled.current && sig(blocks) !== sig(initial)) onDone(blocks);
    onClose();
  };

  const scroller = () => listRef.current?.closest<HTMLElement>('.sheet') ?? null;

  /** Where the dragged row would land, from how far it has moved. */
  const locate = (d: Drag, dy: number) => {
    const r = d.rows[d.index];
    const mid = r.top + dy + r.height / 2;
    let to = 0;
    d.rows.forEach((x, j) => {
      if (j !== d.index && x.top + x.height / 2 < mid) to++;
    });
    return to;
  };

  // While dragging: follow the finger, scroll the sheet near its edges.
  useEffect(() => {
    if (!drag) return;
    document.body.classList.add('dragging');
    let raf = 0;
    const frame = () => {
      const sc = scroller();
      if (sc) {
        const box = sc.getBoundingClientRect();
        const y = pointerY.current;
        if (y < box.top + EDGE) sc.scrollTop -= Math.ceil((box.top + EDGE - y) / 6);
        else if (y > box.bottom - EDGE) sc.scrollTop += Math.ceil((y - box.bottom + EDGE) / 6);
        const dy = y - drag.y0 + sc.scrollTop - drag.scroll0;
        const to = locate(drag, dy);
        setView((v) => (v && v.dy === dy && v.to === to ? v : { dy, to }));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove('dragging');
    };
  }, [drag]);

  const onGripDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.button !== 0) return;
    const list = listRef.current;
    const sc = scroller();
    if (!list || !sc) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const off = sc.getBoundingClientRect().top - sc.scrollTop;
    const rows = [...list.children].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - off, height: r.height };
    });
    const gap = rows.length > 1 ? rows[1].top - rows[0].top - rows[0].height : 8;
    pointerY.current = e.clientY;
    navigator.vibrate?.(10);
    setDrag({ index, y0: e.clientY, scroll0: sc.scrollTop, rows, gap });
    setView({ dy: 0, to: index });
  };
  const onGripMove = (e: PointerEvent) => {
    if (drag) pointerY.current = e.clientY;
  };
  const onGripUp = () => {
    if (!drag) return;
    if (view) setBlocks((bs) => moveBlock(bs, drag.index, view.to));
    setDrag(null);
    setView(null);
  };
  const onGripKey = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setBlocks((bs) => moveBlock(bs, index, index + (e.key === 'ArrowUp' ? -1 : 1)));
  };

  /** How far a row is pushed aside while another is dragged over it. */
  const shift = (j: number) => {
    if (!drag || !view || j === drag.index) return 0;
    const h = drag.rows[drag.index].height + drag.gap;
    if (view.to > drag.index && j > drag.index && j <= view.to) return -h;
    if (view.to < drag.index && j >= view.to && j < drag.index) return h;
    return 0;
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
          const dragging = drag?.index === i;
          const mark = markOf(blocks, i);
          const up = i > 0 ? () => setBlocks((bs) => moveBlock(bs, i, i - 1)) : undefined;
          const down = i < blocks.length - 1 ? () => setBlocks((bs) => moveBlock(bs, i, i + 1)) : undefined;
          const style =
            dragging && view ? { transform: `translateY(${view.dy}px)` } : drag ? { transform: `translateY(${shift(i)}px)` } : undefined;
          const grip = (
            <button
              type="button"
              className="grip ro-grip"
              aria-label={`Drag ${label(b, i)}`}
              onPointerDown={(e) => onGripDown(e, i)}
              onPointerMove={onGripMove}
              onPointerUp={onGripUp}
              onPointerCancel={onGripUp}
              onKeyDown={(e) => onGripKey(e, i)}
            >
              <IconGrip />
            </button>
          );
          const multi = b.items.length > 1;
          return (
            <div
              key={b.id}
              className={
                'ro-block' +
                (b.superset && multi ? ' ro-ss-block' : '') +
                (b.rehabDose ? ' ro-dose' : '') +
                (dragging ? ' is-drag' : '') +
                (drag ? ' moving' : '')
              }
              style={style}
            >
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
