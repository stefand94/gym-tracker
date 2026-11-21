import { useState } from 'react';
import { getExercise } from '../../data/library';
import { addSet, setPain, toggleComplete, toggleSkip } from '../../lib/workout';
import { PainStrip } from '../PainStrip';
import { ItemHead } from './ItemHead';
import { ItemMenu } from './ItemMenu';
import { fieldLabels, SetHeader, SetRow, WarmupRows } from './SetRows';
import { useRecords, useStartRest } from './shared';
import type { BlockProps } from './WorkoutBlockView';

/** One exercise on its own, shown in full. */
export function SingleBlock({ block, update, current, onToggle, onReorder }: BlockProps) {
  const item = block.items[0];
  const ex = getExercise(item.exerciseId);
  const [menu, setMenu] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const startRest = useStartRest();
  const prs = useRecords().get(item.id);
  if (!ex) return <div className="card dim">Unknown exercise: {item.exerciseId}</div>;
  const cls = item.status === 'done' ? ' is-done' : item.status === 'skipped' ? ' is-skipped' : '';
  const nextSet = item.status === 'pending' ? item.sets.findIndex((s) => !s.done) : -1;
  return (
    <section className={'card ex-card' + cls + (current ? ' is-current' : '')}>
      <ItemHead
        ex={ex}
        item={item}
        update={update}
        onMenu={() => setMenu(true)}
        onHeadTap={onToggle}
        noteOpen={noteOpen}
        onNote={setNoteOpen}
      />
      {item.status !== 'skipped' && (
        <div className="sets">
          <SetHeader labels={fieldLabels(ex)} />
          <WarmupRows ex={ex} item={item} update={update} />
          {item.sets.map((_, i) => (
            <SetRow
              key={i}
              ex={ex}
              item={item}
              index={i}
              label={String(i + 1)}
              update={update}
              now={i === nextSet}
              pr={!!prs?.includes(i)}
              onTicked={startRest}
            />
          ))}
        </div>
      )}
      {item.trackPain && item.status !== 'skipped' && (
        <PainStrip value={item.pain} onChange={(v) => update((w) => setPain(w, item.id, v))} />
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
      {menu && (
        <ItemMenu
          ex={ex}
          item={item}
          block={block}
          update={update}
          onClose={() => setMenu(false)}
          onNote={() => setNoteOpen(true)}
          onReorder={onReorder}
        />
      )}
    </section>
  );
}
