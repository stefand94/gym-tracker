import { useEffect, useMemo, useRef, useState } from 'react';
import { allExercises } from '../data/library';
import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import { guessFromName } from '../lib/guessMuscles';
import { FILL_SCHEMA, fillPrompt, readFill, type RawFill } from '../lib/helpers';
import { exerciseMap } from '../lib/muscleLoad';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Exercise, ExerciseType, HowTo } from '../types';
import { BodyMap } from './BodyMap';
import { ExercisePicker } from './ExercisePicker';
import { IconSpark } from './Icons';
import { Sheet } from './Sheet';

const TYPES: [ExerciseType, string][] = [
  ['weight', 'Weights'],
  ['machine', 'Machine'],
  ['bodyweight', 'Bodyweight'],
  ['timed', 'Timed'],
];

const EQUIPMENT = ['Cable', 'Dumbbells', 'Barbell', 'Machine', 'Bodyweight', 'EZ bar', 'Smith machine', 'Kettlebell', 'Band', 'Other'];

type Role = 'primary' | 'secondary';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'exercise'
  );
}

export function uniqueId(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Quick entry for a new exercise (or editing one you made). Muscles are guessed from the name until you
 * touch them; Claude reviews custom exercises later and fixes anything rough.
 */
export function ExerciseEditor({
  initialName = '',
  existing,
  onSaved,
  onClose,
  saveLabel,
}: {
  initialName?: string;
  existing?: Exercise;
  saveLabel?: string;
  onSaved: (e: Exercise) => void;
  onClose: () => void;
}) {
  const { dispatch } = useStore();
  const first = existing ?? null;
  const firstGuess = useMemo(() => guessFromName(initialName), [initialName]);
  const [name, setName] = useState(first?.name ?? initialName);
  const [type, setType] = useState<ExerciseType>(first?.type ?? firstGuess.type);
  const [equipment, setEquipment] = useState(first?.equipment ?? firstGuess.equipment);
  const [primary, setPrimary] = useState<MuscleId[]>(first?.primary ?? firstGuess.primary);
  const [secondary, setSecondary] = useState<MuscleId[]>(first?.secondary ?? firstGuess.secondary);
  const [defaults, setDefaults] = useState(first?.defaults);
  const [weightNote, setWeightNote] = useState(first?.weightNote);
  // Until you touch a field yourself, it follows the guess from the name.
  const [touched, setTouched] = useState({ type: !!first, equipment: !!first, muscles: !!first });
  const [copying, setCopying] = useState(false);
  const [cue, setCue] = useState(first?.cue);
  const [howto, setHowto] = useState<HowTo | undefined>(first?.howto);

  // Claude fills in type, equipment, muscles, cue and a how-to (still marked for review).
  const { ask, ready } = useClaude();
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const fill = async (forName = name) => {
    if (!forName.trim() || filling) return;
    setFilling(true);
    setFillError(null);
    abort.current = new AbortController();
    try {
      const { data } = await ask<RawFill>({
        prompt: fillPrompt(forName, { type, equipment }),
        schema: FILL_SCHEMA,
        signal: abort.current.signal,
      });
      const f = readFill(data);
      setType(f.type);
      setEquipment(f.equipment);
      setPrimary(f.primary);
      setSecondary(f.secondary);
      setDefaults(f.defaults);
      setWeightNote(f.weightNote);
      setCue(f.cue);
      setHowto(f.howto);
      setTouched({ type: true, equipment: true, muscles: true });
      setFilled(true);
    } catch (e) {
      if (!abort.current?.signal.aborted) setFillError(aiMessage(e));
    } finally {
      setFilling(false);
    }
  };
  // Opened from a search ("Create 'hack squat'"): fill straight away.
  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current || existing || !initialName.trim() || !ready || navigator.onLine === false) return;
    autoFilled.current = true;
    void fill(initialName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onName = (v: string) => {
    setName(v);
    const g = guessFromName(v);
    if (!touched.type) setType(g.type);
    if (!touched.equipment) setEquipment(g.equipment);
    if (!touched.muscles) {
      setPrimary(g.primary);
      setSecondary(g.secondary);
    }
  };

  const roleOf = (m: MuscleId): Role | null => (primary.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : null);
  /** off → main → also works → off */
  const cycle = (m: MuscleId) => {
    setTouched((t) => ({ ...t, muscles: true }));
    const r = roleOf(m);
    if (r === null) setPrimary([...primary, m]);
    else if (r === 'primary') {
      setPrimary(primary.filter((x) => x !== m));
      setSecondary([...secondary, m]);
    } else setSecondary(secondary.filter((x) => x !== m));
  };

  const copyFrom = (e: Exercise) => {
    setCopying(false);
    setType(e.type);
    setEquipment(e.equipment);
    setPrimary([...e.primary]);
    setSecondary([...e.secondary]);
    setDefaults(e.defaults);
    setWeightNote(e.weightNote);
    setCue(e.cue);
    setTouched({ type: true, equipment: true, muscles: true });
  };

  const preview: Exercise = {
    id: existing?.id ?? 'new',
    name,
    type,
    equipment,
    primary,
    secondary,
    defaults: defaults ?? { sets: 3 },
  };
  const ok = name.trim().length > 0;

  const save = () => {
    if (!ok) return;
    const clean = name.trim().replace(/^./, (c) => c.toUpperCase());
    const id = existing?.id ?? uniqueId(clean, new Set(allExercises().map((e) => e.id)));
    const base = type === 'timed' ? { sets: 3, seconds: 30 } : { sets: 3, reps: 10 };
    const d = defaults && (type === 'timed') === (defaults.seconds !== undefined) ? defaults : base;
    const ex: Exercise = {
      ...(existing ?? {}),
      id,
      name: clean,
      type,
      equipment: equipment || 'Other',
      primary,
      secondary,
      defaults: { ...d },
      ...(weightNote ? { weightNote } : {}),
      ...(cue ? { cue } : {}),
      ...(howto ? { howto } : {}),
      custom: true,
      reviewed: false,
    };
    const now = new Date().toISOString();
    dispatch({ type: 'exerciseSave', exercise: ex, now });
    onSaved({ ...ex, updatedAt: now });
  };

  if (copying) return <ExercisePicker title="Copy muscles from…" onPick={copyFrom} onClose={() => setCopying(false)} />;

  return (
    <Sheet title={existing ? 'Edit exercise' : 'New exercise'} onClose={onClose} tall>
      <div className="editor">
        <input
          className="input input-lg"
          placeholder="Exercise name"
          value={name}
          autoFocus={!initialName && !existing}
          onChange={(e) => onName(e.target.value)}
        />
        {ready && (
          <div className="fill-row">
            {filling ? (
              <span className="small dim">
                <IconSpark /> Claude is filling in the details…
              </span>
            ) : filled ? (
              <span className="small fill-done">
                <IconSpark /> Filled in by Claude{cue ? ` · “${cue}”` : ''}. Check the muscles; it’s still marked for review.
              </span>
            ) : (
              <button className="btn btn-ghost btn-sm" disabled={!ok} onClick={() => void fill()}>
                <IconSpark /> Fill in with Claude
              </button>
            )}
            {fillError && <div className="error-text small">{fillError}</div>}
          </div>
        )}

        <div className="field-label">Type</div>
        <div className="seg" role="radiogroup">
          {TYPES.map(([t, label]) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              className={'seg-btn' + (type === t ? ' on' : '')}
              onClick={() => {
                setType(t);
                setTouched((x) => ({ ...x, type: true }));
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="field-label">Equipment</div>
        <div className="chips">
          {EQUIPMENT.map((q) => (
            <button
              key={q}
              className={'chip' + (equipment === q ? ' on' : '')}
              onClick={() => {
                setEquipment(equipment === q ? '' : q);
                setTouched((x) => ({ ...x, equipment: true }));
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="spread field-label">
          <span>Muscles</span>
          <button className="link-btn" onClick={() => setCopying(true)}>
            Copy from…
          </button>
        </div>
        <div className="small dim">Tap once for main, twice for “also works”, again to clear.</div>
        <BodyMap load={exerciseMap(preview)} scaleMax={1} size="small" onSelect={cycle} />
        <div className="muscle-grid">
          {MUSCLE_IDS.map((m) => {
            const r = roleOf(m);
            return (
              <button key={m} className={'chip' + (r === 'primary' ? ' on' : r === 'secondary' ? ' half' : '')} onClick={() => cycle(m)}>
                {MUSCLE_LABELS[m]}
              </button>
            );
          })}
        </div>
        {!primary.length && (
          <div className="note-soft">No main muscle yet. That's fine — it just won't show on the body map until Claude reviews it.</div>
        )}
      </div>
      <div className="sheet-footer">
        <button className="btn btn-primary btn-block btn-lg" disabled={!ok} onClick={save}>
          {saveLabel ?? 'Save'}
        </button>
      </div>
    </Sheet>
  );
}
