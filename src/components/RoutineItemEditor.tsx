import { useMemo, useState } from 'react';
import { getExercise } from '../data/library';
import type { EItem } from '../lib/routineBlocks';
import { lastPerformance } from '../lib/prefill';
import { useStore } from '../state/store';
import type { RoutineItem } from '../types';
import { HowToSheet } from './HowToSheet';
import { IconClose, IconInfo } from './Icons';
import { usesStations } from './StationSheet';
import { Stepper } from './Stepper';

/** One exercise: name, station, and sets / reps (or seconds) / weight steppers. Unset values show last time's, dimmed. */
export function RoutineItemEditor({
  item,
  mark,
  onChange,
  onRemove,
  onStation,
}: {
  item: EItem;
  mark: string;
  onChange: (p: Partial<RoutineItem>) => void;
  onRemove: () => void;
  onStation: () => void;
}) {
  const { state } = useStore();
  const [howTo, setHowTo] = useState(false);
  const ex = getExercise(item.exerciseId);
  const last = useMemo(() => lastPerformance(item.exerciseId, state.history, item.station), [item.exerciseId, item.station, state.history]);
  if (!ex) return null;
  const d = ex.defaults;
  const timed = ex.type === 'timed';
  const sets = item.sets ?? last?.length ?? d.sets;
  const count = timed ? (item.seconds ?? last?.[0]?.seconds ?? d.seconds ?? 30) : (item.reps ?? last?.[0]?.reps ?? d.reps ?? 10);
  const weight = item.weight ?? last?.[0]?.weight ?? d.weight;
  const showWeight = ex.type !== 'bodyweight' && ex.type !== 'timed' ? true : item.weight !== undefined;
  const station = usesStations(ex) || !!item.station;

  return (
    <div className="re-item">
      <div className="re-row">
        <span className="re-mark">{mark}</span>
        <div className="grow re-ex-wrap">
          <div className="re-ex">{ex.name}</div>
          <div className="small dim">
            {ex.equipment}
            {ex.weightNote ? ` · ${ex.weightNote}` : ''}
          </div>
        </div>
        <button className="icon-btn" aria-label={`How to do ${ex.name}`} onClick={() => setHowTo(true)}>
          <IconInfo />
        </button>
        <button className="icon-btn" aria-label={`Remove ${ex.name}`} onClick={onRemove}>
          <IconClose />
        </button>
      </div>
      {howTo && <HowToSheet ex={ex} onClose={() => setHowTo(false)} />}
      {station && (
        <button type="button" className={'station-chip' + (item.station ? ' set' : '')} onClick={onStation}>
          {item.station ? <>📍 {item.station}</> : '+ Station'}
        </button>
      )}
      <div className="re-nums">
        <div className={'re-num' + (item.sets === undefined ? ' auto' : '')}>
          <span>sets</span>
          <Stepper
            value={sets}
            step={1}
            min={1}
            unit=""
            label={`${ex.name} sets`}
            onChange={(v) => onChange({ sets: Math.max(1, Math.round(v)) })}
          />
        </div>
        <div className={'re-num' + ((timed ? item.seconds : item.reps) === undefined ? ' auto' : '')}>
          <span>{timed ? 'seconds' : 'reps'}</span>
          <Stepper
            value={count}
            step={timed ? 5 : 1}
            min={1}
            unit=""
            label={`${ex.name} ${timed ? 'seconds' : 'reps'}`}
            onChange={(v) => onChange(timed ? { seconds: Math.round(v) } : { reps: Math.round(v) })}
          />
        </div>
        {showWeight ? (
          <div className={'re-num' + (item.weight === undefined ? ' auto' : '')}>
            <span>{item.weight === undefined ? 'kg · last' : 'kg'}</span>
            <Stepper
              value={weight}
              step={ex.type === 'machine' ? 5 : 2.5}
              unit=""
              decimals
              label={`${ex.name} weight`}
              onChange={(v) => onChange({ weight: v })}
            />
          </div>
        ) : (
          <button className="re-num re-add-kg" onClick={() => onChange({ weight: 2.5 })}>
            + kg
          </button>
        )}
      </div>
    </div>
  );
}
