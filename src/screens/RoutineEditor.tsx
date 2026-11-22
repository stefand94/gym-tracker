import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ExerciseEditor } from '../components/ExerciseEditor';
import { ExercisePicker } from '../components/ExercisePicker';
import { ClaudeButton } from '../components/ClaudeButton';
import { IconBack, IconClose, IconPlus } from '../components/Icons';
import { ReorderSheet, type ReorderBlock } from '../components/ReorderSheet';
import { ConfirmSheet } from '../components/Sheet';
import { RoutineItemEditor } from '../components/RoutineItemEditor';
import { StationSheet } from '../components/StationSheet';
import { getExercise, ROUTINES } from '../data/library';
import { AREA_LABELS } from '../lib/rehab';
import {
  appendExercise,
  fromEditor,
  removeItems,
  splitSuperset,
  toEditor,
  updateItem as updateBlockItem,
  type EBlock,
  type EItem,
} from '../lib/routineBlocks';
import { newRoutineId } from '../lib/routineEdit';
import { applyLayout } from '../lib/workout';
import { useStore } from '../state/store';
import type { Exercise, Routine, RoutineItem } from '../types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  const [reordering, setReordering] = useState(false);

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

  const updateItem = (itemId: string, patch: Partial<RoutineItem>) => setBlocks((bs) => updateBlockItem(bs, itemId, patch));
  const removeIds = (ids: string[]) => setBlocks((bs) => removeItems(bs, ids));
  const add = (ex: Exercise) => {
    setBlocks((bs) => appendExercise(bs, ex));
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
        <button className="icon-btn re-back" aria-label="Back" onClick={leave}>
          <IconBack />
        </button>
        <span className="dim small grow">{existing ? 'Edit workout' : 'New workout'}</span>
        {/* plans Claude makes here go into the editor, not straight into the saved routine */}
        <ClaudeButton
          from={{ kind: 'routine', routine: { ...routine(), id: existing?.id } }}
          onUseInEditor={(n, bs) => {
            if (!name.trim()) setName(n);
            setBlocks(toEditor(bs));
          }}
        />
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
                  <button className="link-btn" onClick={() => setBlocks((bs) => splitSuperset(bs, b.id))}>
                    Break up
                  </button>
                </div>
              )}
              {b.items.map((it, k) => (
                <RoutineItemEditor
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
      <div className="wo-add-row">
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
      {existing && (
        <div className="re-actions re-bottom">
          <button className="btn grow" onClick={duplicate}>
            Duplicate
          </button>
          <button className="btn btn-ghost btn-danger grow" onClick={() => setAsk('delete')}>
            Delete
          </button>
        </div>
      )}

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
