import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { DropTarget } from '../lib/workout';
import { IconGrip } from './Icons';

/** What the list looks like to the drag layer: blocks of named exercises. */
export interface DndBlock {
  id: string;
  superset: boolean;
  items: { id: string; name: string }[];
}

/** One draggable thing: an exercise, or a whole block (all its exercise ids). */
export interface DragSpec {
  key: string;
  ids: string[];
  label: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Starts a keyboard move (Space/Enter on a grip). */
const KeyStart = createContext<(spec: DragSpec, from: HTMLElement) => void>(() => {});

/** Grip handle: hold ~150 ms on touch (so scrolling and ticking never start a drag), drag with a mouse, or Space + arrows. */
export function DragHandle({ spec, className = '' }: { spec: DragSpec; className?: string }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: spec.key, data: spec });
  const startKey = useContext(KeyStart);
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={'grip ' + className}
      {...attributes}
      {...listeners}
      aria-label={`Move ${spec.label}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        startKey(spec, e.currentTarget);
      }}
    >
      <IconGrip />
    </button>
  );
}

/** Where the finger/mouse is right now (viewport coordinates); null for keyboard drags. */
const pointer: { current: { x: number; y: number } | null } = { current: null };

/**
 * Keep the drag preview under the finger. dnd-kit's own transform also counts the scroll we do when the list
 * collapses, so position from the tracked pointer instead.
 */
const followPointer: Modifier = ({ draggingNodeRect, transform }) => {
  const p = pointer.current;
  if (!p || !draggingNodeRect) return transform;
  return { ...transform, x: p.x - draggingNodeRect.left - 28, y: p.y - draggingNodeRect.top - draggingNodeRect.height / 2 };
};

const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

const sameTarget = (a: DropTarget | null, b: DropTarget | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Drag-and-drop for a list of blocks. While dragging, every block shows as a compact row: a line between rows
 * means "move here", the middle of a row means "join as a superset". Dropping calls `onMove`; when it reports a
 * change, an Undo toast shows for 5 s.
 */
export function BlockDnd({
  blocks,
  onMove,
  onUndo,
  children,
}: {
  blocks: DndBlock[];
  /** Apply the move; return false when nothing changed. */
  onMove: (ids: string[], target: DropTarget) => boolean;
  onUndo: () => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const [drag, setDrag] = useState<DragSpec | null>(null);
  /** Keyboard move in progress: arrows step through the drop targets instead of moving a preview. */
  const [keyMode, setKeyMode] = useState(false);
  const keyPos = useRef(0);
  const [live, setLive] = useState('');
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const overlay = useRef<HTMLDivElement>(null);
  const startY = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // The list just collapsed: scroll so the dragged row sits where the finger is.
  useLayoutEffect(() => {
    if (!drag) return;
    document.body.classList.add('dragging');
    const src = document.querySelector<HTMLElement>('.dnd-row.is-src');
    if (src) {
      const r = src.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - startY.current);
    }
    return () => document.body.classList.remove('dragging');
  }, [drag]);

  // Track the pointer while dragging (the drop target and the preview both follow it).
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const c = getEventCoordinates(e);
      if (c) pointer.current = c;
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('touchmove', onMove, { capture: true, passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('touchmove', onMove, true);
    };
  }, [drag]);

  /** Which drops would change something: gaps not right next to a moved whole block, joins into other blocks. */
  const rules = (spec: DragSpec) => {
    const moving = new Set(spec.ids);
    const src = blocks.findIndex((b) => b.items.every((i) => moving.has(i.id)));
    return {
      gap: (n: number): DropTarget | null => (src >= 0 && (n === src || n === src + 1) ? null : { gap: n }),
      join: (b: DndBlock): DropTarget | null => (b.items.some((i) => moving.has(i.id)) ? null : { join: b.id }),
    };
  };

  /** Work out the drop target from the pointer. */
  const locate = (spec: DragSpec): DropTarget | null => {
    const y = pointer.current?.y;
    if (y === undefined) return null;
    const { gap, join } = rules(spec);
    for (let n = 0; n < blocks.length; n++) {
      const r = rows.current.get(blocks[n].id)?.getBoundingClientRect();
      if (!r) continue;
      if (y < r.top) return gap(n);
      if (y <= r.bottom) {
        const rel = (y - r.top) / r.height;
        const edge = Math.min(0.3, 18 / r.height);
        if (rel < edge) return gap(n);
        if (rel > 1 - edge) return gap(n + 1);
        return join(blocks[n]);
      }
    }
    return gap(blocks.length);
  };

  /** Keyboard order of targets: gap 0, join 0, gap 1, join 1, … gap n (position 2n for gaps, 2n + 1 for joins). */
  const keyTargets = (spec: DragSpec) => {
    const { gap, join } = rules(spec);
    const out: { pos: number; t: DropTarget }[] = [];
    blocks.forEach((b, n) => {
      const g = gap(n);
      if (g) out.push({ pos: 2 * n, t: g });
      const j = join(b);
      if (j) out.push({ pos: 2 * n + 1, t: j });
    });
    const last = gap(blocks.length);
    if (last) out.push({ pos: 2 * blocks.length, t: last });
    return out;
  };

  const blockName = (b: DndBlock) => (b.superset ? `Superset ${LETTERS[blocks.indexOf(b) % 26]}` : (b.items[0]?.name ?? ''));
  const describe = (t: DropTarget) => {
    if ('join' in t) {
      const b = blocks.find((x) => x.id === t.join);
      return b ? `Superset with ${blockName(b)}` : '';
    }
    return t.gap >= blocks.length ? 'Move to the end' : `Move before ${blockName(blocks[t.gap])}`;
  };

  const startKey = (spec: DragSpec, from: HTMLElement) => {
    const r = from.getBoundingClientRect();
    startY.current = r.top + r.height / 2;
    pointer.current = null;
    keyPos.current = 2 * blocks.findIndex((b) => b.items.some((i) => i.id === spec.ids[0])) + 1;
    setToast(null);
    setTarget(null);
    setKeyMode(true);
    setDrag(spec);
    setLive(`Picked up ${spec.label}. Arrow keys choose where, Space drops, Escape cancels.`);
  };

  // Keyboard move: arrows step through targets, Space/Enter drops, Escape cancels.
  useEffect(() => {
    if (!keyMode || !drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const list = keyTargets(drag);
        const cur = keyPos.current;
        const next = e.key === 'ArrowUp' ? [...list].reverse().find((c) => c.pos < cur) : list.find((c) => c.pos > cur);
        if (!next) return;
        keyPos.current = next.pos;
        setTarget(next.t);
        setLive(describe(next.t));
        const row = blocks[Math.min(next.pos >> 1, blocks.length - 1)];
        rows.current.get(row.id)?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        end(true);
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        end(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const onStart = (e: DragStartEvent) => {
    const spec = e.active.data.current as DragSpec;
    const c = e.activatorEvent instanceof KeyboardEvent ? null : getEventCoordinates(e.activatorEvent);
    pointer.current = c;
    startY.current = c?.y ?? e.active.rect.current.initial?.top ?? 0;
    navigator.vibrate?.(12);
    setToast(null);
    setTarget(null);
    setDrag(spec);
  };

  const onMoveEvt = (e: DragMoveEvent) => {
    const spec = e.active.data.current as DragSpec;
    const t = locate(spec);
    setTarget((prev) => (sameTarget(prev, t) ? prev : t));
  };

  const end = (drop: boolean) => {
    const spec = drag;
    const t = target;
    const wasKey = keyMode;
    setDrag(null);
    setTarget(null);
    setKeyMode(false);
    const moved = !!(drop && spec && t && onMove(spec.ids, t));
    if (moved) setToast(spec!.label);
    if (wasKey && spec) {
      setLive(moved ? `Moved ${spec.label}` : 'Move cancelled');
      // put focus back on the moved exercise's grip (or its block's)
      setTimeout(() => {
        const grips = [...document.querySelectorAll<HTMLElement>('.grip')];
        (grips.find((g) => g.getAttribute('aria-label') === `Move ${spec.label}`) ?? grips[0])?.focus({ preventScroll: true });
      }, 60);
    }
  };

  let gapIndex = -1;
  if (target && 'gap' in target) gapIndex = target.gap;

  return (
    <KeyStart.Provider value={startKey}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={onStart}
        onDragMove={onMoveEvt}
        onDragEnd={() => end(true)}
        onDragCancel={() => end(false)}
        accessibility={{
          screenReaderInstructions: {
            draggable: 'To move an exercise, press Space, use the arrow keys to move, Space again to drop, Escape to cancel.',
          },
        }}
      >
        {drag ? (
          <div className="dnd-list">
            {blocks.map((b, i) => (
              <DropRow
                key={b.id}
                block={b}
                index={i}
                src={b.items.some((it) => drag.ids.includes(it.id))}
                gapBefore={gapIndex === i}
                gapAfter={gapIndex === blocks.length && i === blocks.length - 1}
                join={!!target && 'join' in target && target.join === b.id}
                register={(el) => (el ? rows.current.set(b.id, el) : rows.current.delete(b.id))}
              />
            ))}
            <p className="dnd-hint">Drop between exercises to move · on one to superset</p>
          </div>
        ) : (
          children
        )}
        <DragOverlay modifiers={[followPointer]} dropAnimation={null}>
          {drag && (
            <div ref={overlay} className="dnd-overlay">
              <IconGrip />
              <span>{drag.label}</span>
            </div>
          )}
        </DragOverlay>
        {toast && !drag && (
          <div className="toast" role="status">
            <span>Moved {toast}</span>
            <button
              className="toast-btn"
              onClick={() => {
                onUndo();
                setToast(null);
              }}
            >
              Undo
            </button>
          </div>
        )}
        <div className="sr-only" aria-live="assertive">
          {live}
        </div>
      </DndContext>
    </KeyStart.Provider>
  );
}

function DropRow({
  block,
  index,
  src,
  gapBefore,
  gapAfter,
  join,
  register,
}: {
  block: DndBlock;
  index: number;
  src: boolean;
  gapBefore: boolean;
  gapAfter: boolean;
  join: boolean;
  register: (el: HTMLElement | null) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `drop:${block.id}` });
  const letter = LETTERS[index % 26];
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        register(el);
      }}
      className={
        'dnd-row' + (src ? ' is-src' : '') + (join ? ' is-join' : '') + (gapBefore ? ' gap-before' : '') + (gapAfter ? ' gap-after' : '')
      }
    >
      {block.superset && (
        <div className="dnd-ss">
          <DragHandle spec={{ key: `b:${block.id}`, ids: block.items.map((i) => i.id), label: `Superset ${letter}` }} />
          Superset {letter}
        </div>
      )}
      {block.items.map((it, n) => (
        <div key={it.id} className="dnd-item">
          <DragHandle spec={{ key: `i:${it.id}`, ids: [it.id], label: it.name }} />
          <span className="dnd-mark">{block.superset ? `${letter}${n + 1}` : index + 1}</span>
          <span className="dnd-name">{it.name}</span>
        </div>
      ))}
      {join && <span className="dnd-join-label">Superset</span>}
    </div>
  );
}
