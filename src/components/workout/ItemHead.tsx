import { useState } from 'react';
import { getExercise } from '../../data/library';
import { MUSCLE_LABELS } from '../../data/muscles';
import { fmtNum } from '../../lib/format';
import { exerciseMap } from '../../lib/muscleLoad';
import { stationsFor } from '../../lib/prefill';
import { stallText } from '../../lib/stall';
import { keepLastWeight, setStation } from '../../lib/workout';
import { useStore } from '../../state/store';
import type { Exercise, WorkoutItem } from '../../types';
import { BodyMap } from '../BodyMap';
import { IconChevronUp, IconMore } from '../Icons';
import { ItemNote } from '../NoteSheet';
import { StationSheet, usesStations } from '../StationSheet';
import type { Update } from './shared';
import { StallSheet } from './StallSheet';

function StatusBadge({ item }: { item: WorkoutItem }) {
  if (item.status === 'done') return <span className="badge badge-done">Done</span>;
  if (item.status === 'skipped') return <span className="badge badge-skip">Skipped</span>;
  return null;
}

/** An exercise's name, muscles and cue, with its station, go-up or stuck tag, and note underneath. */
export function ItemHead({
  ex,
  item,
  tag,
  onMenu,
  onHeadTap,
  update,
  noteOpen,
  onNote,
}: {
  ex: Exercise;
  item: WorkoutItem;
  tag?: string;
  onMenu: () => void;
  /** Fold the card to a one-line row (a chevron too, unless it's in a superset, whose header has one). */
  onHeadTap?: () => void;
  update: Update;
  noteOpen: boolean;
  onNote: (open: boolean) => void;
}) {
  const { state } = useStore();
  const [picking, setPicking] = useState(false);
  const [fixing, setFixing] = useState(false);
  const showStation = item.status !== 'skipped' && (!!item.station || usesStations(ex) || stationsFor(ex.id, state.history).length > 0);
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
    <>
      <div className="ex-head">
        {onHeadTap ? (
          <button type="button" className="grow ex-head-btn" onClick={onHeadTap} aria-expanded aria-label={`Fold ${ex.name}`}>
            {text}
          </button>
        ) : (
          <div className="grow">{text}</div>
        )}
        <BodyMap load={exerciseMap(ex)} scaleMax={1} size="mini" />
        {onHeadTap && !tag && (
          <button type="button" className="icon-btn fold-btn" aria-label={`Fold ${ex.name}`} onClick={onHeadTap}>
            <IconChevronUp />
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`Options for ${ex.name}`} onClick={onMenu}>
          <IconMore />
        </button>
      </div>
      {showStation && (
        <button
          type="button"
          className={'station-chip' + (item.station ? ' set' : '')}
          onClick={() => setPicking(true)}
          aria-label={item.station ? `Station ${item.station}, change` : 'Set station'}
        >
          {item.station ? <>📍 {item.station}</> : '+ Station'}
        </button>
      )}
      {!!item.goUp && item.status !== 'skipped' && (
        <div className="goup">
          <span className="goup-tag">
            ↑ {item.goUp > 0 ? `${fmtNum(item.goUp)} kg up` : `${fmtNum(-item.goUp)} kg less help`} · every rep last time
          </span>
          {!item.sets.some((s) => s.done) && (
            <button
              type="button"
              className="link-btn small"
              onClick={() => update((w) => keepLastWeight(w, item.id, state.history, getExercise))}
            >
              Keep last weight
            </button>
          )}
        </div>
      )}
      {item.stall && item.status !== 'skipped' && !item.sets.some((s) => s.done) && (
        <div className="goup">
          <button type="button" className="goup-tag stall-tag" onClick={() => setFixing(true)}>
            Stuck · {stallText(item.stall)}
          </button>
          <button type="button" className="link-btn small" onClick={() => setFixing(true)}>
            Fix it
          </button>
        </div>
      )}
      <ItemNote ex={ex} item={item} update={update} open={noteOpen} onOpen={onNote} />
      {fixing && <StallSheet ex={ex} item={item} update={update} onClose={() => setFixing(false)} />}
      {picking && (
        <StationSheet
          ex={ex}
          current={item.station}
          history={state.history}
          onPick={(st) => update((w) => setStation(w, item.id, st, state.history, getExercise))}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
