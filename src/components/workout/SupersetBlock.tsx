import { useState } from 'react';
import { getExercise } from '../../data/library';
import { addRound, blockComplete, roundComplete, setPain, toggleComplete } from '../../lib/workout';
import { IconChevronUp } from '../Icons';
import { PainStrip } from '../PainStrip';
import { ItemHead } from './ItemHead';
import { ItemMenu } from './ItemMenu';
import { fieldLabels, SetHeader, SetRow, WarmupGroup } from './SetRows';
import { blockLetter, useRecords, useStartRest } from './shared';
import type { BlockProps } from './WorkoutBlockView';

/** Exercises done round by round, resting only once a round is finished. */
export function SupersetBlock({ block, index, update, current, onToggle }: BlockProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const startRest = useStartRest();
  const records = useRecords();
  const letter = blockLetter(index);
  const entries = block.items.map((item, n) => ({
    item,
    ex: getExercise(item.exerciseId),
    tag: `${letter}${n + 1}`,
  }));
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
        <span className="badge badge-ss lift">Superset {letter}</span>
        <span className="ss-top-end">
          {complete && <span className="badge badge-done">Done</span>}
          <button type="button" className="icon-btn fold-btn" aria-label={`Fold superset ${letter}`} onClick={onToggle}>
            <IconChevronUp />
          </button>
        </span>
      </div>
      {entries.map(({ item, ex, tag }) =>
        ex ? (
          <div key={item.id} className="ss-item-head">
            <ItemHead
              ex={ex}
              item={item}
              tag={tag}
              update={update}
              onMenu={() => setMenuFor(item.id)}
              onHeadTap={onToggle}
              noteOpen={noteFor === item.id}
              onNote={(o) => setNoteFor(o ? item.id : null)}
            />
          </div>
        ) : null,
      )}
      <div className="sets">
        {shared && <SetHeader labels={shared} />}
        <WarmupGroup entries={active.map((e) => ({ ex: e.ex!, item: e.item }))} update={update} units={!shared} />
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
                  pr={!!records.get(e.item.id)?.includes(r)}
                  onTicked={tickedIn(e.item.id, r)}
                />
              ))}
          </div>
        ))}
      </div>
      {active
        .filter((e) => e.item.trackPain)
        .map((e) => (
          <PainStrip
            key={e.item.id}
            label={`${e.tag} pain`}
            value={e.item.pain}
            onChange={(v) => update((w) => setPain(w, e.item.id, v))}
          />
        ))}
      <div className="ex-actions">
        <button className="btn" disabled={!active.length} onClick={() => update((w) => addRound(w, block.id))}>
          + Round
        </button>
        <button
          className={'btn btn-all' + (allDone ? ' on' : '')}
          onClick={() =>
            update((w) =>
              block.items
                .filter((i) => i.status !== 'skipped' && (allDone || i.status !== 'done'))
                .reduce((acc, i) => toggleComplete(acc, i.id), w),
            )
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
          update={update}
          onClose={() => setMenuFor(null)}
          onNote={() => setNoteFor(menuEntry.item.id)}
        />
      )}
    </section>
  );
}
