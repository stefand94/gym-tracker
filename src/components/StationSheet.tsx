import { useState } from 'react';
import { allStations, cleanStation, stationKey, stationsFor } from '../lib/prefill';
import type { Exercise, Workout } from '../types';
import { Sheet } from './Sheet';

/** Equipment where the same weight feels different from one station to the next. */
export function usesStations(ex: Exercise): boolean {
  return ex.type === 'machine' || ex.equipment === 'Cable' || ex.equipment === 'Machine';
}

/** Pick the station an exercise is done on: this exercise's stations, then any other, then a new one. */
export function StationSheet({
  ex,
  current,
  history,
  onPick,
  onClose,
}: {
  ex: Exercise;
  current?: string;
  history: Workout[];
  onPick: (station: string | undefined) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const mine = stationsFor(ex.id, history);
  const mineKeys = new Set(mine.map(stationKey));
  const others = allStations(history).filter((s) => !mineKeys.has(stationKey(s)));
  const cur = current ? stationKey(current) : null;
  const pick = (s: string | undefined) => {
    onPick(s);
    onClose();
  };
  const typed = cleanStation(text);
  const existing = typed ? [...mine, ...others].find((s) => stationKey(s) === stationKey(typed)) : undefined;

  const chips = (list: string[]) => (
    <div className="chips station-chips">
      {list.map((s) => (
        <button key={s} className={'chip' + (stationKey(s) === cur ? ' on' : '')} onClick={() => pick(s)}>
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <Sheet title={`Station · ${ex.name}`} onClose={onClose}>
      {mine.length > 0 && (
        <>
          <div className="field-label">Used for this exercise</div>
          {chips(mine)}
        </>
      )}
      {others.length > 0 && (
        <>
          <div className="field-label">Other stations</div>
          {chips(others)}
        </>
      )}
      <form
        className="station-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed) pick(existing ?? typed);
        }}
      >
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="New station, e.g. Upstairs 1"
          enterKeyHint="done"
          autoFocus={!mine.length && !others.length}
        />
        <button className="btn btn-primary" disabled={!typed}>
          Use
        </button>
      </form>
      <p className="note-soft">Weights pre-fill from the last time on the same station.</p>
      {current && (
        <button className="menu-item" onClick={() => pick(undefined)}>
          No station
        </button>
      )}
    </Sheet>
  );
}
