import { useState } from 'react';
import { getExercise } from '../../data/library';
import { primeAudio, tickFeedback } from '../../lib/alert';
import { weightStep } from '../../lib/format';
import { rightSeconds } from '../../lib/sides';
import { completeHold, SWITCH_SIDES, toggleSet, toggleWarmup, updateSetForward, updateWarmup, type SetPatch } from '../../lib/workout';
import { useStore, type HoldState } from '../../state/store';
import type { Exercise, SetEntry, WorkoutItem } from '../../types';
import { HoldDisplay } from '../HoldTimer';
import { IconCheck, IconChevronUp, IconClose, IconPlay } from '../Icons';
import { NumInput, Stepper } from '../Stepper';
import type { Update } from './shared';

/** Column labels for an exercise's set fields, in display order. */
export function fieldLabels(ex: Exercise): string[] {
  if (ex.type === 'timed') return [ex.sides ? 'sec · each side' : 'sec', ''];
  if (ex.type === 'bodyweight') return ['reps', '+kg'];
  return ['kg', 'reps'];
}

function SetFields({ ex, set, onChange, units }: { ex: Exercise; set: SetEntry; onChange: (p: SetPatch) => void; units: boolean }) {
  const u = (s: string) => (units ? s : '');
  if (ex.type === 'timed')
    return <Stepper label="Seconds" unit={u('s')} step={5} value={set.seconds} onChange={(v) => onChange({ seconds: Math.round(v) })} />;
  if (ex.type === 'bodyweight')
    return (
      <>
        <Stepper label="Reps" unit={u('reps')} step={1} value={set.reps} onChange={(v) => onChange({ reps: Math.round(v) })} />
        <NumInput label="Added weight" unit={u('+kg')} decimals value={set.weight ?? 0} onChange={(v) => onChange({ weight: v })} />
      </>
    );
  return (
    <>
      <Stepper label="Weight" unit={u('kg')} step={weightStep(ex)} decimals value={set.weight} onChange={(v) => onChange({ weight: v })} />
      <Stepper label="Reps" unit={u('reps')} step={1} value={set.reps} onChange={(v) => onChange({ reps: Math.round(v) })} />
    </>
  );
}

/** Weight × reps rows: two steppers side by side, sharing the row evenly. */
const pairs = (ex: Exercise) => ex.type === 'weight' || ex.type === 'machine';

export function SetHeader({ labels }: { labels: string[] }) {
  return (
    <div className={'set-row set-head' + (labels[1] === 'reps' ? ' pair' : '')} aria-hidden>
      <div>set</div>
      {labels.map((l) => (
        <div key={l}>{l}</div>
      ))}
      <div>done</div>
    </div>
  );
}

export function SetRow({
  ex,
  item,
  index,
  label,
  update,
  units = false,
  now = false,
  pr = false,
  onTicked,
}: {
  ex: Exercise;
  item: WorkoutItem;
  index: number;
  label: string;
  update: Update;
  units?: boolean;
  /** The next set to do: highlighted. */
  now?: boolean;
  /** This set beats your best for the exercise. */
  pr?: boolean;
  onTicked: () => void;
}) {
  const { state, dispatch } = useStore();
  const set = item.sets[index];
  const timed = ex.type === 'timed';
  const sided = timed && !!ex.sides;
  const hold = timed && state.hold?.itemId === item.id && state.hold.set === index ? state.hold : null;
  /** The hold running on this side of the set (or on the set, for a one-sided hold). */
  const holdOn = (side?: 'L' | 'R') => (hold && hold.side === side ? hold : null);

  const tap = () => {
    if (hold) {
      dispatch({ type: 'holdStop' });
      // Stopped mid-hold: log what was actually held. During get-ready: an ordinary tick.
      if (Date.now() >= hold.goAt) {
        const held = Math.max(1, Math.round((Date.now() - hold.goAt) / 1000));
        if (hold.side === 'L') {
          // left side stopped early: log it, then on to the right
          update((w) => completeHold(w, item.id, index, held, 'L'));
          const seconds = rightSeconds(set) ?? held;
          return dispatch({ type: 'holdStart', itemId: item.id, set: index, seconds, now: Date.now(), lead: SWITCH_SIDES, side: 'R' });
        }
        tickFeedback();
        onTicked();
        return update((w) => completeHold(w, item.id, index, held, hold.side));
      }
    }
    if (!set.done) {
      tickFeedback();
      onTicked();
    }
    update((w) => toggleSet(w, item.id, index));
  };

  const change = (p: SetPatch) => update((w) => updateSetForward(w, item.id, index, p, getExercise));

  /** The play / cancel button for a hold (one side of a two-sided one). */
  const holdButton = (running: HoldState | null, seconds: number | undefined, side?: 'L' | 'R') => {
    if (running)
      return (
        <button type="button" className="hold-btn" aria-label="Cancel timer" onClick={() => dispatch({ type: 'holdStop' })}>
          <IconClose />
        </button>
      );
    if (set.done || !seconds) return <div />;
    const which = side === 'L' ? ' (left side)' : side === 'R' ? ' (right side)' : '';
    return (
      <button
        type="button"
        className="hold-btn play"
        aria-label={`Start ${seconds} second timer for set ${index + 1} of ${ex.name}${which}`}
        onClick={() => {
          primeAudio();
          dispatch({ type: 'holdStart', itemId: item.id, set: index, seconds, now: Date.now(), side });
        }}
      >
        <IconPlay />
      </button>
    );
  };

  const tick = (
    <button
      type="button"
      className={'tick' + (set.done ? ' on' : '') + (pr && set.done ? ' pr' : '')}
      aria-label={
        hold
          ? `Stop timer and log ${hold.side === 'L' ? 'the left side of ' : ''}set ${index + 1} of ${ex.name}`
          : `${set.done ? 'Untick' : 'Tick'} set ${index + 1} of ${ex.name}${pr && set.done ? ' (personal record)' : ''}`
      }
      aria-pressed={set.done}
      onClick={tap}
    >
      <IconCheck />
    </button>
  );
  const cls = 'set-row' + (pairs(ex) ? ' pair' : '') + (set.done ? ' done' : '') + (now ? ' now' : '') + (hold ? ' holding' : '');

  if (sided) {
    const side = (s: 'L' | 'R') => {
      const running = holdOn(s);
      const seconds = s === 'L' ? set.seconds : rightSeconds(set);
      return (
        <div className={'side-row' + (running ? ' holding' : '')}>
          {running ? (
            <HoldDisplay hold={running} onStop={tap} />
          ) : (
            <Stepper
              label={`${s === 'L' ? 'Left' : 'Right'} side seconds`}
              unit={units ? `s ${s}` : s}
              step={5}
              value={seconds}
              onChange={(v) => change(s === 'L' ? { seconds: Math.round(v) } : { secondsR: Math.round(v) })}
            />
          )}
          {holdButton(running, seconds, s)}
        </div>
      );
    };
    return (
      <div className={cls + ' sided'}>
        <div className="set-idx">{label}</div>
        {side('L')}
        {tick}
        {side('R')}
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="set-idx">{label}</div>
      {hold ? <HoldDisplay hold={hold} onStop={tap} /> : <SetFields ex={ex} set={set} units={units} onChange={change} />}
      {timed && holdButton(hold, set.seconds)}
      {tick}
    </div>
  );
}

/** An exercise's ramp-up sets, above the working sets: marked W, no rest after, and not counted anywhere. */
export function WarmupRows({ ex, item, update, units = false }: { ex: Exercise; item: WorkoutItem; update: Update; units?: boolean }) {
  if (!item.warmups?.length || item.status === 'skipped') return null;
  return (
    <>
      {item.warmups.map((set, k) => (
        <div key={`w${k}`} className={'set-row warmup' + (pairs(ex) ? ' pair' : '') + (set.done ? ' done' : '')}>
          <div className="set-idx" aria-label="Warm-up">
            W
          </div>
          <SetFields ex={ex} set={set} units={units} onChange={(p) => update((w) => updateWarmup(w, item.id, k, p))} />
          <button
            type="button"
            className={'tick' + (set.done ? ' on' : '')}
            aria-label={`${set.done ? 'Untick' : 'Tick'} warm-up ${k + 1} of ${ex.name}`}
            aria-pressed={set.done}
            onClick={() => {
              if (!set.done) tickFeedback();
              update((w) => toggleWarmup(w, item.id, k));
            }}
          >
            <IconCheck />
          </button>
        </div>
      ))}
    </>
  );
}

/**
 * The warm-ups of a card (one exercise, or each in a superset). They fold to a single line once the work sets have
 * started or every warm-up is ticked, so the set you're on stays near the top; tap the line to open them again.
 */
export function WarmupGroup({
  entries,
  update,
  units = false,
}: {
  entries: { ex: Exercise; item: WorkoutItem }[];
  update: Update;
  units?: boolean;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = entries.filter((e) => e.item.warmups?.length && e.item.status !== 'skipped');
  if (!shown.length) return null;
  const all = shown.flatMap((e) => e.item.warmups ?? []);
  const done = all.filter((s) => s.done).length;
  const started = shown.some((e) => e.item.sets.some((s) => s.done));
  const folded = !(open ?? !(started || done === all.length));
  return (
    <div className="warmups">
      <button type="button" className="round-label warmup-toggle" aria-expanded={!folded} onClick={() => setOpen(folded)}>
        <span>Warm-up</span>
        <span className="warmup-count">
          {done}/{all.length}
          {done === all.length ? ' ✓' : ''}
        </span>
        <span className={'warmup-chev' + (folded ? ' down' : '')} aria-hidden>
          <IconChevronUp />
        </span>
      </button>
      {!folded && shown.map((e) => <WarmupRows key={e.item.id} ex={e.ex} item={e.item} update={update} units={units} />)}
    </div>
  );
}
