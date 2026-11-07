import { useState } from 'react';
import { getExercise } from '../data/library';
import { MUSCLE_LABELS } from '../data/muscles';
import { weightStep } from '../lib/format';
import { exerciseMap } from '../lib/muscleLoad';
import {
  addSet,
  blockComplete,
  moveBlock,
  removeItem,
  removeSet,
  splitBlock,
  supersetWithNext,
  toggleComplete,
  toggleSet,
  toggleSkip,
  updateSet,
  updateUnticked,
  type SetPatch,
} from '../lib/workout';
import type { Exercise, SetEntry, Workout, WorkoutBlock, WorkoutItem } from '../types';
import { BodyMap } from './BodyMap';
import { IconCheck, IconMore } from './Icons';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

type Update = (fn: (w: Workout) => Workout) => void;

interface BlockProps {
  block: WorkoutBlock;
  index: number;
  count: number;
  update: Update;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Column labels for an exercise's set fields, in display order. */
function fieldLabels(ex: Exercise): string[] {
  if (ex.type === 'timed') return ['sec'];
  if (ex.type === 'bodyweight') return ['reps', '+kg'];
  return ['kg', 'reps'];
}

function SetFields({
  ex,
  set,
  onChange,
  units = true,
}: {
  ex: Exercise;
  set: SetEntry;
  onChange: (p: SetPatch) => void;
  units?: boolean;
}) {
  const u = (s: string) => (units ? s : '');
  if (ex.type === 'timed')
    return <Stepper label="Seconds" unit={u('s')} step={5} value={set.seconds} onChange={(v) => onChange({ seconds: v })} />;
  const reps = <Stepper label="Reps" unit={u('reps')} step={1} value={set.reps} onChange={(v) => onChange({ reps: Math.round(v) })} />;
  if (ex.type === 'bodyweight')
    return (
      <>
        {reps}
        <Stepper label="Added weight" unit={u('+kg')} step={2.5} decimals value={set.weight ?? 0} onChange={(v) => onChange({ weight: v })} />
      </>
    );
  return (
    <>
      <Stepper label="Weight" unit={u('kg')} step={weightStep(ex)} decimals value={set.weight} onChange={(v) => onChange({ weight: v })} />
      {reps}
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
}: {
  ex: Exercise;
  item: WorkoutItem;
  index: number;
  label: string;
  update: Update;
  units?: boolean;
}) {
  const set = item.sets[index];
  const single = ex.type === 'timed';
  return (
    <div className={'set-row' + (single ? ' single' : '') + (set.done ? ' done' : '')}>
      <div className="set-idx">{label}</div>
      <SetFields ex={ex} set={set} units={units} onChange={(p) => update((w) => updateSet(w, item.id, index, p))} />
      <button
        type="button"
        className={'tick' + (set.done ? ' on' : '')}
        aria-label={`${set.done ? 'Untick' : 'Tick'} set ${index + 1} of ${ex.name}`}
        aria-pressed={set.done}
        onClick={() => {
          if (!set.done) navigator.vibrate?.(15);
          update((w) => toggleSet(w, item.id, index));
        }}
      >
        <IconCheck />
      </button>
    </div>
  );
}

function TargetRow({ ex, item, update }: { ex: Exercise; item: WorkoutItem; update: Update }) {
  const ref = item.sets.find((s) => !s.done) ?? item.sets[item.sets.length - 1];
  if (!ref || item.status !== 'pending') return null;
  return (
    <div className="target">
      <span className="target-label">All sets</span>
      <SetFields ex={ex} set={ref} onChange={(p) => update((w) => updateUnticked(w, item.id, p))} />
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
}: {
  ex: Exercise;
  item: WorkoutItem;
  tag?: string;
  onMenu: () => void;
}) {
  const done = item.sets.filter((s) => s.done).length;
  const muscles = ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ');
  return (
    <div className="ex-head">
      <div className="grow">
        <div className="ex-name">
          {tag && <span className="ss-tag">{tag} </span>}
          {ex.name} <StatusBadge item={item} />
        </div>
        <div className="ex-sub">
          {ex.equipment} · {muscles}
          {ex.weightNote ? ` · ${ex.weightNote}` : ''}
        </div>
        <div className="ex-sub num">
          {done}/{item.sets.length} sets
        </div>
      </div>
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
  const act = (fn: (w: Workout) => Workout) => {
    update(fn);
    onClose();
  };
  return (
    <Sheet title={ex.name} onClose={onClose}>
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
        onClick={() => {
          if (confirm(`Remove ${ex.name} from this workout?`)) act((w) => removeItem(w, item.id));
        }}
      >
        Remove from workout
      </button>
    </Sheet>
  );
}

function SingleBlock({ block, index, count, update }: BlockProps) {
  const item = block.items[0];
  const ex = getExercise(item.exerciseId);
  const [menu, setMenu] = useState(false);
  if (!ex) return <div className="card dim">Unknown exercise: {item.exerciseId}</div>;
  const cls = item.status === 'done' ? ' is-done' : item.status === 'skipped' ? ' is-skipped' : '';
  return (
    <section className={'card ex-card' + cls}>
      <ItemHead ex={ex} item={item} onMenu={() => setMenu(true)} />
      {item.status !== 'skipped' && (
        <>
          <TargetRow ex={ex} item={item} update={update} />
          <div className="sets">
            <SetHeader labels={fieldLabels(ex)} />
            {item.sets.map((_, i) => (
              <SetRow key={i} ex={ex} item={item} index={i} label={String(i + 1)} update={update} />
            ))}
          </div>
        </>
      )}
      <div className="ex-actions">
        <button
          className={'btn btn-sm' + (item.status === 'done' ? ' on' : '')}
          disabled={item.status === 'skipped'}
          onClick={() => update((w) => toggleComplete(w, item.id))}
        >
          {item.status === 'done' ? 'Completed ✓' : 'Complete all'}
        </button>
        <button className={'btn btn-sm' + (item.status === 'skipped' ? ' on' : '')} onClick={() => update((w) => toggleSkip(w, item.id))}>
          {item.status === 'skipped' ? 'Unskip' : 'Skip'}
        </button>
      </div>
      {menu && <ItemMenu ex={ex} item={item} block={block} index={index} count={count} update={update} onClose={() => setMenu(false)} />}
    </section>
  );
}

function SupersetBlock({ block, index, count, update }: BlockProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const letter = LETTERS[index % 26];
  const entries = block.items.map((item, n) => ({ item, ex: getExercise(item.exerciseId), tag: `${letter}${n + 1}` }));
  const active = entries.filter((e) => e.ex && e.item.status !== 'skipped');
  const rounds = Math.max(0, ...active.map((e) => e.item.sets.length));
  const complete = blockComplete(block);
  const allDone = block.items.every((i) => i.status === 'done');
  const menuEntry = entries.find((e) => e.item.id === menuFor);
  const labelSets = [...new Set(active.map((e) => fieldLabels(e.ex!).join('|')))];
  const shared = labelSets.length === 1 ? labelSets[0].split('|') : null;

  return (
    <section className={'card ex-card ss-block' + (complete ? ' is-done' : '')}>
      <div className="spread" style={{ padding: '10px 14px 0' }}>
        <span className="badge badge-ss">Superset {letter}</span>
        {complete && <span className="badge badge-done">Done</span>}
      </div>
      {entries.map(({ item, ex, tag }) =>
        ex ? (
          <div key={item.id} className="ss-item-head">
            <ItemHead ex={ex} item={item} tag={tag} onMenu={() => setMenuFor(item.id)} />
            <TargetRow ex={ex} item={item} update={update} />
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
                <SetRow key={e.item.id} ex={e.ex!} item={e.item} index={r} label={e.tag} update={update} units={!shared} />
              ))}
          </div>
        ))}
      </div>
      <div className="ex-actions">
        <button
          className={'btn btn-sm' + (allDone ? ' on' : '')}
          onClick={() =>
            update((w) => {
              let next = w;
              for (const i of block.items) {
                if (i.status === 'skipped') continue;
                if (allDone || i.status !== 'done') next = toggleComplete(next, i.id);
              }
              return next;
            })
          }
        >
          {allDone ? 'Completed ✓' : 'Complete all'}
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

export function WorkoutBlockView(props: BlockProps) {
  return props.block.superset ? <SupersetBlock {...props} /> : <SingleBlock {...props} />;
}
