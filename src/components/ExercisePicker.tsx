import { useMemo, useState } from 'react';
import { EXERCISES } from '../data/library';
import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import { exerciseMap } from '../lib/muscleLoad';
import type { Exercise } from '../types';
import { BodyMap } from './BodyMap';
import { Sheet } from './Sheet';

export function ExercisePicker({ onPick, onClose, title = 'Add exercise' }: { onPick: (e: Exercise) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EXERCISES.filter(
      (e) =>
        (!needle || e.name.toLowerCase().includes(needle) || e.equipment.toLowerCase().includes(needle)) &&
        (!muscle || e.primary.includes(muscle) || e.secondary.includes(muscle)),
    ).sort((a, b) => {
      if (muscle) {
        const pa = a.primary.includes(muscle) ? 0 : 1;
        const pb = b.primary.includes(muscle) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [q, muscle]);

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="search stack">
        <input className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips chips-scroll">
          {MUSCLE_IDS.map((m) => (
            <button key={m} className={'chip' + (muscle === m ? ' on' : '')} onClick={() => setMuscle(muscle === m ? null : m)}>
              {MUSCLE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      {list.map((e) => (
        <button key={e.id} className="picker-item" onClick={() => onPick(e)}>
          <BodyMap load={exerciseMap(e)} scaleMax={1} size="mini" />
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{e.name}</div>
            <div className="small dim">
              {e.equipment} · {e.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
            </div>
          </div>
        </button>
      ))}
      {!list.length && <div className="empty">No exercises match. Ask Claude to add it.</div>}
    </Sheet>
  );
}
