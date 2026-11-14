import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { performedExerciseIds } from '../lib/progress';
import { allExercises } from '../data/library';
import { searchExercises } from '../lib/search';
import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import { exerciseGroup, GROUP_LABELS, GROUPS, type Group } from '../lib/groups';
import { exerciseMap } from '../lib/muscleLoad';
import { rankReplacements } from '../lib/similar';
import type { Exercise } from '../types';
import { BodyMap } from './BodyMap';
import { Sheet } from './Sheet';

const RECENT_MAX = 8;

function Row({ e, onPick }: { e: Exercise; onPick: (e: Exercise) => void }) {
  return (
    <button className="picker-item" onClick={() => onPick(e)}>
      <BodyMap load={exerciseMap(e)} scaleMax={1} size="mini" />
      <div className="grow picker-text">
        <div className="picker-name">
          {e.name}
          {e.custom && <span className="tag-yours">Yours</span>}
        </div>
        <div className="picker-meta">
          {[e.equipment, e.primary.map((m) => MUSCLE_LABELS[m]).join(', ')].filter(Boolean).join(' · ')}
        </div>
      </div>
    </button>
  );
}

function Section({ label, list, onPick }: { label: string; list: Exercise[]; onPick: (e: Exercise) => void }) {
  if (!list.length) return null;
  return (
    <>
      <div className="picker-label">{label}</div>
      {list.map((e) => (
        <Row key={e.id} e={e} onPick={onPick} />
      ))}
    </>
  );
}

/**
 * Searchable exercise list. With `similarTo`, it's a replacement picker: exercises that work the same main
 * muscles come first, closest match at the top. With `onCreate`, the list ends in "Create '<query>'".
 */
export function ExercisePicker({
  onPick,
  onClose,
  onCreate,
  title = 'Add exercise',
  similarTo,
}: {
  onPick: (e: Exercise) => void;
  onClose: () => void;
  onCreate?: (name: string) => void;
  title?: string;
  similarTo?: Exercise;
}) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const custom = state.customExercises;

  const filtered = useMemo(
    () =>
      allExercises().filter(
        (e) => (!muscle || e.primary.includes(muscle) || e.secondary.includes(muscle)) && (!group || exerciseGroup(e) === group),
      ),
    // custom: the registry behind allExercises() changes with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [muscle, group, custom],
  );
  const searching = q.trim().length > 0;
  const results = useMemo(() => (searching ? searchExercises(filtered, q) : null), [searching, filtered, q]);
  const az = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (muscle) {
          const pa = a.primary.includes(muscle) ? 0 : 1;
          const pb = b.primary.includes(muscle) ? 0 : 1;
          if (pa !== pb) return pa - pb;
        }
        return a.name.localeCompare(b.name);
      }),
    [filtered, muscle],
  );
  const recent = useMemo(() => {
    if (searching || similarTo) return [];
    const ok = new Map(filtered.map((e) => [e.id, e]));
    return performedExerciseIds(state.history)
      .map((id) => ok.get(id))
      .filter((e): e is Exercise => !!e)
      .slice(0, RECENT_MAX);
  }, [searching, similarTo, filtered, state.history]);
  const ranked = useMemo(() => (similarTo ? rankReplacements(similarTo, results ?? az) : null), [similarTo, results, az]);

  const count = ranked ? ranked.close.length + ranked.other.length : (results ?? az).length;
  const pickMuscle = (m: MuscleId) => {
    setMuscle(muscle === m ? null : m);
    setMusclesOpen(false);
  };

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="search">
        <div className="search-box">
          <input
            className="input"
            type="search"
            enterKeyHint="search"
            placeholder="Search, e.g. one arm cable row"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="search-clear" aria-label="Clear search" onClick={() => setQ('')}>
              ✕
            </button>
          )}
        </div>
        <div className="filter-row">
          {GROUPS.map((g) => (
            <button key={g} className={'chip' + (group === g ? ' on' : '')} onClick={() => setGroup(group === g ? null : g)}>
              {GROUP_LABELS[g]}
            </button>
          ))}
          {muscle ? (
            <button className="chip on chip-muscle" onClick={() => setMuscle(null)} aria-label={`Clear ${MUSCLE_LABELS[muscle]} filter`}>
              {MUSCLE_LABELS[muscle]} ✕
            </button>
          ) : (
            <button
              className={'chip chip-muscle' + (musclesOpen ? ' open' : '')}
              aria-expanded={musclesOpen}
              onClick={() => setMusclesOpen(!musclesOpen)}
            >
              Muscle ▾
            </button>
          )}
        </div>
        {musclesOpen && (
          <div className="muscle-grid">
            {MUSCLE_IDS.map((m) => (
              <button key={m} className={'chip' + (muscle === m ? ' on' : '')} onClick={() => pickMuscle(m)}>
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {ranked ? (
        <>
          <Section label={`Same muscles as ${similarTo!.name}`} list={ranked.close} onPick={onPick} />
          <Section label={ranked.close.length ? 'Other exercises' : 'All exercises'} list={ranked.other} onPick={onPick} />
        </>
      ) : results ? (
        <Section label={`${results.length} result${results.length === 1 ? '' : 's'}`} list={results} onPick={onPick} />
      ) : (
        <>
          <Section label="Recent" list={recent} onPick={onPick} />
          <Section label={group || muscle ? 'Matching exercises' : 'All exercises'} list={az} onPick={onPick} />
        </>
      )}
      {!count && <div className="empty">No exercises match.</div>}
      {onCreate && (
        <button className="picker-create" onClick={() => onCreate(q.trim())}>
          <span className="picker-create-plus">+</span>
          {searching ? `Create “${q.trim()}”` : 'Create an exercise'}
        </button>
      )}
    </Sheet>
  );
}
