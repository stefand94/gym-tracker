import { useMemo, useState } from 'react';
import { EXERCISES } from '../data/library';
import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import { exerciseGroup, GROUP_LABELS, GROUPS, type Group } from '../lib/groups';
import { exerciseMap } from '../lib/muscleLoad';
import { rankReplacements } from '../lib/similar';
import type { Exercise } from '../types';
import { BodyMap } from './BodyMap';
import { Sheet } from './Sheet';

function Row({ e, onPick }: { e: Exercise; onPick: (e: Exercise) => void }) {
  return (
    <button className="picker-item" onClick={() => onPick(e)}>
      <BodyMap load={exerciseMap(e)} scaleMax={1} size="mini" />
      <div className="grow">
        <div style={{ fontWeight: 700 }}>{e.name}</div>
        <div className="small dim">
          {e.equipment} · {e.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
        </div>
      </div>
    </button>
  );
}

/**
 * Searchable exercise list. With `similarTo`, it's a replacement picker: exercises that work the same main
 * muscles come first, closest match at the top.
 */
export function ExercisePicker({
  onPick,
  onClose,
  title = 'Add exercise',
  similarTo,
}: {
  onPick: (e: Exercise) => void;
  onClose: () => void;
  title?: string;
  similarTo?: Exercise;
}) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return EXERCISES.filter(
      (e) =>
        (!needle || e.name.toLowerCase().includes(needle) || e.equipment.toLowerCase().includes(needle)) &&
        (!muscle || e.primary.includes(muscle) || e.secondary.includes(muscle)) &&
        (!group || exerciseGroup(e) === group),
    ).sort((a, b) => {
      if (muscle) {
        const pa = a.primary.includes(muscle) ? 0 : 1;
        const pb = b.primary.includes(muscle) ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [q, muscle, group]);
  const ranked = useMemo(() => (similarTo ? rankReplacements(similarTo, list) : null), [similarTo, list]);

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="search stack">
        <input className="input" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips chips-groups">
          {GROUPS.map((g) => (
            <button key={g} className={'chip' + (group === g ? ' on' : '')} onClick={() => setGroup(group === g ? null : g)}>
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
        <div className="chips chips-scroll">
          {MUSCLE_IDS.map((m) => (
            <button key={m} className={'chip' + (muscle === m ? ' on' : '')} onClick={() => setMuscle(muscle === m ? null : m)}>
              {MUSCLE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      {ranked ? (
        <>
          {ranked.close.length > 0 && (
            <>
              <div className="picker-label">Same muscles as {similarTo!.name}</div>
              {ranked.close.map((e) => (
                <Row key={e.id} e={e} onPick={onPick} />
              ))}
            </>
          )}
          {ranked.other.length > 0 && (
            <>
              <div className="picker-label">{ranked.close.length ? 'Other exercises' : 'All exercises'}</div>
              {ranked.other.map((e) => (
                <Row key={e.id} e={e} onPick={onPick} />
              ))}
            </>
          )}
        </>
      ) : (
        list.map((e) => <Row key={e.id} e={e} onPick={onPick} />)
      )}
      {!(ranked ? ranked.close.length + ranked.other.length : list.length) && <div className="empty">No exercises match. Ask Claude to add it.</div>}
    </Sheet>
  );
}
