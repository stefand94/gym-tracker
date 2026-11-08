import { useState } from 'react';
import { getExercise } from '../data/library';
import { MUSCLE_LABELS } from '../data/muscles';
import { tickFeedback } from '../lib/alert';
import { itemSummary, weightStep } from '../lib/format';
import { exerciseMap } from '../lib/muscleLoad';
import {
  addRound,
  addSet,
  blockComplete,
  moveBlock,
  removeItem,
  removeSet,
  replaceItem,
  roundComplete,
  splitBlock,
  supersetWithNext,
  toggleComplete,
  toggleSet,
  toggleSkip,
  updateSetForward,
  type SetPatch,
} from '../lib/workout';
import { useStore } from '../state/store';
import type { Exercise, SetEntry, Workout, WorkoutBlock, WorkoutItem } from '../types';
import { BodyMap } from './BodyMap';
import { ExercisePicker } from './ExercisePicker';
import { IconCheck, IconMore } from './Icons';
import { Sheet } from './Sheet';
import { NumInput, Stepper } from './Stepper';

type Update = (fn: (w: Workout) => Workout) => void;

export interface BlockProps {
  block: WorkoutBlock;
  index: number;
  count: number;
  update: Update;
  /** Shown in full (true) or as one-line rows (false). */
  open: boolean;
  /** The block you're on now. */
  current: boolean;
  onToggle: () => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Starts the rest countdown after a tick, when the rest timer is switched on. */
function useStartRest() {
  const { state, dispatch } = useStore();
  return () => {
    if (state.prefs.rest) dispatch({ type: 'restStart', now: Date.now() });
  };
}

/** Column labels for an exercise's set fields, in display order. */
function fieldLabels(ex: Exercise): string[] {
  if (ex.type === 'timed') return ['sec'];
  if (ex.type === 'bodyweight') return ['reps', '+kg'];
  return ['kg', 'reps'];
}

function SetFields({ ex, set, onChange, units }: { ex: Exercise; set: SetEntry; onChange: (p: SetPatch) => void; units: boolean }) {
  const u = (s: string) => (units ? s : '');
  if (ex.type === 'timed')
    return <Stepper label="Seconds" unit={u('s')} step={5} value={set.seconds} onChange={(v) => onChange({ seconds: Math.round(v) })} />;
  if (ex.type === 'bodyweight')
    return (
      <>
        <Stepper label="Reps" unit={u('reps')} step={1} value={set.reps} onChange={(v) => onChange({ reps: Math.round(v) })} />
        <NumInput label="Added weight" unit={u('+kg')} decimals value={set.weight ?? 0} onChange={(v) => onChange({ weight: v })} />
      </>
    );
  return (
    <>
      <Stepper label="Weight" unit={u('kg')} step={weightStep(ex)} decimals value={set.weight} onChange={(v) => onChange({ weight: v })} />
      <NumInput label="Reps" unit={u('reps')} value={set.reps} onChange={(v) => onChange({ reps: v })} />
    </>
  );
}

function SetHeader({ labels }: { labels: string[] }) {
  return (
    <div className={'set-row set-head' + (labels.length === 1 ? ' single' : '')} aria-hidden>
      <div>set</div>
      {labels.map((l) => (
        <div key={l}>{l}</div>
      ))}
      <div>done</div>
    </div>
  );
}

function SetRow({
  ex,
  item,
  index,
  label,
  update,
  units = false,
  now = false,
  onTicked,
}: {
  ex: Exercise;
  item: WorkoutItem;
  index: number;
  label: string;
  update: Update;
  units?: boolean;
  /** The next set to do: highlighted. */
  now?: boolean;
  onTicked: () => void;
}) {
  const set = item.sets[index];
  const single = ex.type === 'timed';
  return (
    <div className={'set-row' + (single ? ' single' : '') + (set.done ? ' done' : '') + (now ? ' now' : '')}>
      <div className="set-idx">{label}</div>
      <SetFields ex={ex} set={set} units={units} onChange={(p) => update((w) => updateSetForward(w, item.id, index, p))} />
      <button
        type="button"
        className={'tick' + (set.done ? ' on' : '')}
        aria-label={`${set.done ? 'Untick' : 'Tick'} set ${index + 1} of ${ex.name}`}
        aria-pressed={set.done}
        onClick={() => {
          if (!set.done) {
            tickFeedback();
            onTicked();
          }
          update((w) => toggleSet(w, item.id, index));
        }}
      >
        <IconCheck />
      </button>
    </div>
  );
}

function StatusBadge({ item }: { item: WorkoutItem }) {
  if (item.status === 'done') return <span className="badge badge-done">Done</span>;
  if (item.status === 'skipped') return <span className="badge badge-skip">Skipped</span>;
  return null;
}

function ItemHead({
  ex,
  item,
  tag,
  onMenu,
  onHeadTap,
}: {
  ex: Exercise;
  item: WorkoutItem;
  tag?: string;
  onMenu: () => void;
  onHeadTap?: () => void;
}) {
  const muscles = ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ');
  const text = (
    <>
      <div className="ex-name">
        {tag && <span className="ss-tag">{tag} </span>}
        {ex.name} <StatusBadge item={item} />
      </div>
      <div className="ex-sub">
        {muscles}
        {ex.weightNote ? (
          <>
            {' · '}
            <em>kg {ex.weightNote}</em>
          </>
        ) : null}
        {ex.cue ? <span className="ex-cue">{ex.cue}</span> : null}
      </div>
    </>
  );
  return (
    <div className="ex-head">
      {onHeadTap ? (
        <button type="button" className="grow ex-head-btn" onClick={onHeadTap} aria-label={`Collapse ${ex.name}`}>
          {text}
        </button>
      ) : (
        <div className="grow">{text}</div>
      )}
      <BodyMap load={exerciseMap(ex)} scaleMax={1} size="mini" />
      <button type="button" className="icon-btn" aria-label={`Options for ${ex.name}`} onClick={onMenu}>
        <IconMore />
      </button>
    </div>
  );
}

function ItemMenu({
  ex,
  item,
  block,
  index,
  count,
  update,
  onClose,
}: {
  ex: Exercise;
  item: WorkoutItem;
  block: WorkoutBlock;
  index: number;
  count: number;
  update: Update;
  onClose: () => void;
}) {
  const { state } = useStore();
  const [armed, setArmed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const act = (fn: (w: Workout) => Workout) => {
    update(fn);
    onClose();
  };
  if (replacing)
    return (
      <ExercisePicker
        title="Replace exercise"
        similarTo={ex}
        onClose={onClose}
        onPick={(next) => act((w) => replaceItem(w, item.id, next, state.history))}
      />
    );
  return (
    <Sheet title={ex.name} onClose={onClose}>
      <button className="menu-item" onClick={() => setReplacing(true)}>
        Replace exercise…
      </button>
      <button className="menu-item" onClick={() => act((w) => toggleComplete(w, item.id))}>
        {item.status === 'done' ? 'Untick all sets' : 'Complete all sets'}
      </button>
      <button className="menu-item" onClick={() => act((w) => toggleSkip(w, item.id))}>
        {item.status === 'skipped' ? 'Unskip exercise' : 'Skip exercise'}
      </button>
      <button className="menu-item" onClick={() => act((w) => addSet(w, item.id))}>
        Add a set
      </button>
      <button className="menu-item" disabled={item.sets.length <= 1} onClick={() => act((w) => removeSet(w, item.id))}>
        Remove last set
      </button>
      <button className="menu-item" disabled={index === 0} onClick={() => act((w) => moveBlock(w, block.id, -1))}>
        Move up
      </button>
      <button className="menu-item" disabled={index >= count - 1} onClick={() => act((w) => moveBlock(w, block.id, 1))}>
        Move down
      </button>
      <button className="menu-item" disabled={index >= count - 1} onClick={() => act((w) => supersetWithNext(w, block.id))}>
        Superset with next exercise
      </button>
      {block.superset && (
        <button className="menu-item" onClick={() => act((w) => splitBlock(w, block.id))}>
          Split superset
        </button>
      )}
      <button
        className="menu-item danger"
        onClick={() => (armed ? act((w) => removeItem(w, item.id)) : setArmed(true))}
      >
        {armed ? `Tap again to remove ${ex.name}` : 'Remove from workout'}
      </button>
    </Sheet>
  );
}

function SingleBlock({ block, index, count, update, current, onToggle }: BlockProps) {
  const item = block.items[0];
  const ex = getExercise(item.exerciseId);
  const [menu, setMenu] = useState(false);
  const startRest = useStartRest();
  if (!ex) return <div className="card dim">Unknown exercise: {item.exerciseId}</div>;
  const cls = item.status === 'done' ? ' is-done' : item.status === 'skipped' ? ' is-skipped' : '';
  const nextSet = item.status === 'pending' ? item.sets.findIndex((s) => !s.done) : -1;
  return (
    <section className={'card ex-card' + cls + (current ? ' is-current' : '')}>
      <ItemHead ex={ex} item={item} onMenu={() => setMenu(true)} onHeadTap={current ? undefined : onToggle} />
      {item.status !== 'skipped' && (
        <div className="sets">
          <SetHeader labels={fieldLabels(ex)} />
          {item.sets.map((_, i) => (
            <SetRow key={i} ex={ex} item={item} index={i} label={String(i + 1)} update={update} now={i === nextSet} onTicked={startRest} />
          ))}
        </div>
      )}
      <div className="ex-actions">
        <button className={'btn' + (item.status === 'skipped' ? ' on' : '')} onClick={() => update((w) => toggleSkip(w, item.id))}>
          {item.status === 'skipped' ? 'Unskip' : 'Skip'}
        </button>
        <button className="btn" disabled={item.status === 'skipped'} onClick={() => update((w) => addSet(w, item.id))}>
          + Set
        </button>
        <button
          className={'btn btn-all' + (item.status === 'done' ? ' on' : '')}
          disabled={item.status === 'skipped'}
          onClick={() => update((w) => toggleComplete(w, item.id))}
        >
          {item.status === 'done' ? 'Undo all' : 'Complete all'}
        </button>
      </div>
      {menu && <ItemMenu ex={ex} item={item} block={block} index={index} count={count} update={update} onClose={() => setMenu(false)} />}
    </section>
  );
}

function SupersetBlock({ block, index, count, update, current, onToggle }: BlockProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const startRest = useStartRest();
  const letter = LETTERS[index % 26];
  const entries = block.items.map((item, n) => ({ item, ex: getExercise(item.exerciseId), tag: `${letter}${n + 1}` }));
  const active = entries.filter((e) => e.ex && e.item.status !== 'skipped');
  const rounds = Math.max(0, ...active.map((e) => e.item.sets.length));
  const complete = blockComplete(block);
  const allDone = block.items.every((i) => i.status === 'done');
  const menuEntry = entries.find((e) => e.item.id === menuFor);
  const labelSets = [...new Set(active.map((e) => fieldLabels(e.ex!).join('|')))];
  const shared = labelSets.length === 1 ? labelSets[0].split('|') : null;

  // The next set to do: first unticked set in round order.
  let next: { item: string; round: number } | null = null;
  for (let r = 0; r < rounds && !next; r++)
    for (const e of active)
      if (r < e.item.sets.length && !e.item.sets[r].done) {
        next = { item: e.item.id, round: r };
        break;
      }

  // Rest only once the whole round is done, not between the exercises in it.
  const tickedIn = (itemId: string, round: number) => () => {
    const others = { ...block, items: block.items.filter((i) => i.id !== itemId) };
    if (roundComplete(others, round)) startRest();
  };

  return (
    <section className={'card ex-card ss-block' + (complete ? ' is-done' : '') + (current ? ' is-current' : '')}>
      <div className="spread ss-top">
        <span className="badge badge-ss">Superset {letter}</span>
        {complete && <span className="badge badge-done">Done</span>}
      </div>
      {entries.map(({ item, ex, tag }) =>
        ex ? (
          <div key={item.id} className="ss-item-head">
            <ItemHead ex={ex} item={item} tag={tag} onMenu={() => setMenuFor(item.id)} onHeadTap={current ? undefined : onToggle} />
          </div>
        ) : null,
      )}
      <div className="sets">
        {shared && <SetHeader labels={shared} />}
        {Array.from({ length: rounds }, (_, r) => (
          <div key={r}>
            <div className="round-label">Round {r + 1}</div>
            {active
              .filter((e) => r < e.item.sets.length)
              .map((e) => (
                <SetRow
                  key={e.item.id}
                  ex={e.ex!}
                  item={e.item}
                  index={r}
                  label={e.tag}
                  update={update}
                  units={!shared}
                  now={next?.item === e.item.id && next.round === r}
                  onTicked={tickedIn(e.item.id, r)}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="ex-actions">
        <button className="btn" disabled={!active.length} onClick={() => update((w) => addRound(w, block.id))}>
          + Round
        </button>
        <button
          className={'btn btn-all' + (allDone ? ' on' : '')}
          onClick={() =>
            update((w) => {
              let nextW = w;
              for (const i of block.items) {
                if (i.status === 'skipped') continue;
                if (allDone || i.status !== 'done') nextW = toggleComplete(nextW, i.id);
              }
              return nextW;
            })
          }
        >
          {allDone ? 'Undo all' : 'Complete all'}
        </button>
      </div>
      {menuEntry?.ex && (
        <ItemMenu
          ex={menuEntry.ex}
          item={menuEntry.item}
          block={block}
          index={index}
          count={count}
          update={update}
          onClose={() => setMenuFor(null)}
        />
      )}
    </section>
  );
}

/** A block shown as one-line rows: finished exercises with their summary, or an exercise still to come. */
function CollapsedBlock({ block, index, onToggle }: BlockProps) {
  const complete = blockComplete(block);
  const letter = LETTERS[index % 26];
  if (!complete) {
    const names = block.items.map((i) => getExercise(i.exerciseId)?.name ?? i.exerciseId).join(' + ');
    const first = block.items[0];
    const sub = block.superset
      ? `Superset · ${Math.max(...block.items.map((i) => i.sets.length))} rounds`
      : itemSummary(getExercise(first.exerciseId), first);
    return (
      <button type="button" className="crow crow-next" onClick={onToggle}>
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

export function WorkoutBlockView(props: BlockProps) {
  if (!props.open) return <CollapsedBlock {...props} />;
  return props.block.superset ? <SupersetBlock {...props} /> : <SingleBlock {...props} />;
}
