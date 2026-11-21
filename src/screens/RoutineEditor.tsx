import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ExerciseEditor } from '../components/ExerciseEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { HowToSheet } from '../components/HowToSheet';
import { AskSheet } from '../components/AskSheet';
import { IconBack, IconClose, IconInfo, IconPlus, IconSpark } from '../components/Icons';
import { ReorderSheet, type ReorderBlock } from '../components/ReorderSheet';
import { ConfirmSheet } from '../components/Sheet';
import { StationSheet, usesStations } from '../components/StationSheet';
import { Stepper } from '../components/Stepper';
import { getExercise, ROUTINES } from '../data/library';
import { uid } from '../lib/id';
import { lastPerformance } from '../lib/prefill';
import { AREA_LABELS } from '../lib/rehab';
import { newRoutineId } from '../lib/routineEdit';
import { applyLayout } from '../lib/workout';
import { useStore } from '../state/store';
import { useClaude } from '../state/useClaude';
import type { Exercise, Routine, RoutineBlock, RoutineItem } from '../types';

type EItem = RoutineItem & { id: string };
type EBlock = { id: string; superset?: boolean; rehabDose?: RoutineBlock['rehabDose']; items: EItem[] };

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Editor blocks: a plain block with several exercises becomes one block each (as in a workout). */
function toEditor(blocks: RoutineBlock[]): EBlock[] {
  return blocks.flatMap((b) => {
    const items = b.items.map((i) => ({ ...i, id: uid() }));
    if (b.rehabDose || (b.superset && items.length > 1)) return [{ id: uid(), superset: !b.rehabDose, rehabDose: b.rehabDose, items }];
    return items.map((i) => ({ id: uid(), items: [i] }));
  });
}

function fromEditor(blocks: EBlock[]): RoutineBlock[] {
  return blocks
    .filter((b) => b.items.length)
    .map((b) => {
      const items = b.items.map(({ id: _id, ...i }) => i);
      if (b.rehabDose) return { rehabDose: b.rehabDose, items };
      return b.superset && items.length > 1 ? { superset: true, items } : { items };
    });
}

/** Build or edit a routine: name, exercises in blocks (reorder and superset in a sheet), sets/reps/weight, stations. */
export function RoutineEditor() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const location = useLocation();
  const existing = id && id !== 'new' ? state.routines.find((r) => r.id === id && !r.archived) : undefined;
  const draft = (location.state as { draft?: Omit<Routine, 'id'> } | null)?.draft;
  // a draft over an existing routine (Claude's "Edit first") starts from the draft but counts as an unsaved change
  const start = draft ? { ...existing, ...draft } : existing;

  const [name, setName] = useState(start?.name ?? '');
  const [description, setDescription] = useState(start?.description ?? '');
  const [blocks, setBlocks] = useState<EBlock[]>(() => toEditor(start?.blocks ?? []));
  const snapshot = (n: string, d: string, bs: EBlock[]) => JSON.stringify({ n: n.trim(), d: d.trim(), b: fromEditor(bs) });
  const initial = useRef<string | null>(null);
  if (initial.current === null)
    initial.current =
      existing && draft
        ? snapshot(existing.name, existing.description ?? '', toEditor(existing.blocks))
        : snapshot(name, description, blocks);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [station, setStation] = useState<EItem | null>(null);
  const [ask, setAsk] = useState<'leave' | 'delete' | null>(null);
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reordering, setReordering] = useState(false);
  const { ready: aiReady } = useClaude();

  const itemCount = blocks.reduce((n, b) => n + b.items.length, 0);
  const valid = name.trim().length > 0 && itemCount > 0;
  const routine = (): Omit<Routine, 'id'> => ({
    ...(existing ?? {}),
    name: name.trim(),
    description: description.trim() || undefined,
    blocks: fromEditor(blocks),
    days: undefined,
  });
  const dirty = snapshot(name, description, blocks) !== initial.current;

  if (id && id !== 'new' && !existing) return <div className="empty">Routine not found.</div>;

  const taken = () => [...state.routines.map((r) => r.id), ...ROUTINES.map((r) => r.id)];
  const save = () => {
    setTried(true);
    if (!valid) return;
    const r = { ...routine(), id: existing?.id ?? newRoutineId(name, taken()) } as Routine;
    dispatch({ type: 'routineSave', routine: r, now: new Date().toISOString() });
    nav('/', { replace: true });
  };
  const duplicate = () => {
    const copyName = `${name.trim() || 'Workout'} copy`;
    const r = { ...routine(), name: copyName, rehab: undefined, id: newRoutineId(copyName, taken()) } as Routine;
    dispatch({ type: 'routineSave', routine: r, now: new Date().toISOString() });
    nav(`/routines/${r.id}`, { replace: true });
  };
  const leave = () => (dirty ? setAsk('leave') : nav(-1));

  const updateItem = (itemId: string, patch: Partial<RoutineItem>) =>
    setBlocks((bs) => bs.map((b) => ({ ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) })));
  const removeIds = (ids: string[]) =>
    setBlocks((bs) =>
      bs
        .map((b) => {
          const items = b.items.filter((i) => !ids.includes(i.id));
          return { ...b, items, superset: !!b.superset && items.length > 1 };
        })
        .filter((b) => b.items.length),
    );
  const split = (blockId: string) =>
    setBlocks((bs) => bs.flatMap((b) => (b.id === blockId ? b.items.map((i, n) => ({ id: n ? uid() : b.id, items: [i] })) : [b])));
  const add = (ex: Exercise) => {
    const d = ex.defaults;
    const item: EItem = {
      id: uid(),
      exerciseId: ex.id,
      sets: d.sets,
      ...(ex.type === 'timed' ? { seconds: d.seconds } : { reps: d.reps }),
    };
    setBlocks((bs) => [...bs, { id: uid(), items: [item] }]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  };

  const reorderBlocks: ReorderBlock[] = blocks.map((b) => ({
    id: b.id,
    superset: !!b.superset,
    rehabDose: b.rehabDose,
    items: b.items.map((i) => ({ id: i.id, name: getExercise(i.exerciseId)?.name ?? i.exerciseId })),
  }));

  return (
    <div className="re">
      <div className="spread re-top">
        <button className="icon-btn" aria-label="Back" onClick={leave} style={{ marginLeft: -10 }}>
          <IconBack />
        </button>
        <span className="dim small grow">{existing ? 'Edit workout' : 'New workout'}</span>
        <button className="btn btn-primary" onClick={save} disabled={tried && !valid}>
          Save
        </button>
      </div>

      <input
        className="re-name"
        aria-label="Workout name"
        placeholder="Workout name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus={!start}
      />
      <input
        className="input re-desc"
        aria-label="Description"
        placeholder="Description (optional), e.g. Pull focus"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {tried && !valid && (
        <div className="re-error" role="alert">
          {!name.trim() ? 'Give it a name.' : 'Add at least one exercise.'}
        </div>
      )}

      <div className="re-list">
        {blocks.map((b, at) => {
          // the dose block isn't numbered, so the ones after it don't skip a number
          const n = blocks.slice(0, at).filter((x) => !x.rehabDose).length;
          const letter = LETTERS[n % 26];
          if (b.rehabDose)
            return (
              <div key={b.id} className="re-block re-dose">
                <div className="re-row">
                  <div className="grow">
                    <div className="re-ex">{AREA_LABELS[b.rehabDose]} daily dose</div>
                    <div className="small dim">Follows your rehab phase · ~5 min</div>
                  </div>
                  <button className="icon-btn" aria-label="Remove the rehab dose" onClick={() => removeIds(b.items.map((i) => i.id))}>
                    <IconClose />
                  </button>
                </div>
              </div>
            );
          return (
            <div key={b.id} className={'re-block' + (b.superset ? ' re-ss' : '')}>
              {b.superset && (
                <div className="re-ss-head">
                  <span className="badge badge-ss">Superset {letter}</span>
                  <button className="link-btn" onClick={() => split(b.id)}>
                    Split
                  </button>
                </div>
              )}
              {b.items.map((it, k) => (
                <ItemEditor
                  key={it.id}
                  item={it}
                  mark={b.superset ? `${letter}${k + 1}` : String(n + 1)}
                  onChange={(p) => updateItem(it.id, p)}
                  onRemove={() => removeIds([it.id])}
                  onStation={() => setStation(it)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {!blocks.length && <div className="empty">No exercises yet.</div>}
      <div className="wo-add-row" style={{ marginTop: 12 }}>
        <button className="btn btn-lg btn-dashed grow" onClick={() => setPicking(true)}>
          <IconPlus /> Add exercise
        </button>
        {blocks.length > 1 && (
          <button className="btn btn-lg" onClick={() => setReordering(true)}>
            Reorder
          </button>
        )}
      </div>
      {reordering && (
        <ReorderSheet
          blocks={reorderBlocks}
          onDone={(layout) => setBlocks((bs) => applyLayout(bs, layout))}
          onClose={() => setReordering(false)}
        />
      )}
      {aiReady && (
        <button className="btn btn-block btn-ghost ask-btn" style={{ marginTop: 8 }} onClick={() => setAsking(true)}>
          <IconSpark /> Ask Claude to build or change this
        </button>
      )}
      {asking && (
        <AskSheet
          from={{ kind: 'routine', routine: { ...routine(), id: existing?.id } }}
          onClose={() => setAsking(false)}
          onUseInEditor={(n, bs) => {
            if (!name.trim()) setName(n);
            setBlocks(toEditor(bs));
          }}
        />
      )}

      <div className="stack" style={{ marginTop: 20 }}>
        <button className="btn btn-primary btn-block btn-lg" onClick={save}>
          Save workout
        </button>
        {existing && (
          <div className="re-actions">
            <button className="btn grow" onClick={duplicate}>
              Duplicate
            </button>
            <button className="btn btn-ghost btn-danger grow" onClick={() => setAsk('delete')}>
              Delete
            </button>
          </div>
        )}
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ex) => {
            add(ex);
            setPicking(false);
          }}
          onCreate={(q) => {
            setPicking(false);
            setCreating(q);
          }}
        />
      )}
      {creating !== null && (
        <ExerciseEditor
          initialName={creating}
          saveLabel="Save & add"
          onClose={() => setCreating(null)}
          onSaved={(ex) => {
            add(ex);
            setCreating(null);
          }}
        />
      )}
      {station && getExercise(station.exerciseId) && (
        <StationSheet
          ex={getExercise(station.exerciseId)!}
          current={station.station}
          history={state.history}
          onPick={(st) => updateItem(station.id, { station: st })}
          onClose={() => setStation(null)}
        />
      )}
      {ask === 'leave' && (
        <ConfirmSheet
          title="Discard changes?"
          body="What you changed here won't be saved."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => nav(-1)}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === 'delete' && existing && (
        <ConfirmSheet
          title={`Delete ${existing.name}?`}
          body="Your logged workouts stay in History."
          confirmLabel="Delete workout"
          cancelLabel="Keep it"
          danger
          onConfirm={() => {
            dispatch({ type: 'routineArchive', id: existing.id, now: new Date().toISOString() });
            nav('/', { replace: true });
          }}
          onClose={() => setAsk(null)}
        />
      )}
    </div>
  );
}

/** One exercise: name, station, and sets / reps (or seconds) / weight steppers. Unset values show last time's, dimmed. */
function ItemEditor({
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
