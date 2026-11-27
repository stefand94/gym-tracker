import { useEffect, useMemo, useRef, useState } from 'react';
import { allExercises, getExercise } from '../data/library';
import {
  AREAS,
  AVOID_LABELS,
  buildDaily,
  DAILY_ID,
  defaultMinutes,
  KITS,
  TIME_CHOICES,
  type Area,
  type Avoid,
  type DailyOptions,
} from '../lib/daily';
import { readTweak, TWEAK_SCHEMA, tweakPrompt, type RawTweak, type Tweak } from '../lib/dailyTweak';
import { routineMap } from '../lib/muscleLoad';
import { doseItems, rehabState } from '../lib/rehab';
import { workoutFromRoutine } from '../lib/workout';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import type { Routine, RoutineBlock, Workout } from '../types';
import { BodyMap } from './BodyMap';
import { IconSend, IconSpark } from './Icons';

/** Today's choices, kept on this device until midnight so leaving Home doesn't lose them. */
interface Saved {
  day: string;
  minutes: number;
  focus?: Area;
  avoid: Avoid[];
  /** Claude's change, for the draft it was made from (`for`). */
  tweak?: Tweak & { for: string };
}

const KEY = 'gym-tracker:today';
const today = () => new Date().toLocaleDateString('en-CA');

function load(): Saved {
  const fresh: Saved = { day: today(), minutes: defaultMinutes(), avoid: [] };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    return s && s.day === fresh.day ? { ...fresh, ...s } : fresh;
  } catch {
    return fresh;
  }
}

/** What the draft is, so a change Claude made to an older draft isn't shown on a new one. */
const draftKey = (blocks: RoutineBlock[]) => blocks.map((b) => b.items.map((i) => i.exerciseId).join('+')).join(',');

function PlanList({ blocks, newIds }: { blocks: RoutineBlock[]; newIds: string[] }) {
  return (
    <ol className="plan daily-plan">
      {blocks.map((b, n) =>
        b.rehabDose ? (
          <li key={n} className="plan-dose">
            Hamstring dose <span className="dim">(your rehab phase)</span>
          </li>
        ) : (
          <li key={n} className={b.superset ? 'plan-ss' : ''}>
            {b.superset && <span className="badge badge-ss">Superset</span>}
            {b.items.map((i) => (
              <div key={i.exerciseId}>
                {getExercise(i.exerciseId)?.name ?? i.exerciseId}
                {i.sets ? <span className="dim"> · {i.sets} sets</span> : null}
                {newIds.includes(i.exerciseId) && <span className="new-tag">New</span>}
              </div>
            ))}
          </li>
        ),
      )}
    </ol>
  );
}

/**
 * Home's main card: a workout built for today from the muscle load, the last session and the exercises he does,
 * sized to the time he has. Focus and avoid chips rebuild it at once; ✦ lets Haiku change it ("bench is taken").
 */
export function TodayCard({ onStart }: { onStart: (w: Workout) => void }) {
  const { state } = useStore();
  const { ask, ready } = useClaude();
  const [saved, setSaved] = useState<Saved>(load);
  const [more, setMore] = useState(!!saved.focus || saved.avoid.length > 0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(saved)), [saved]);

  const rehab = useMemo(() => rehabState(state.history, state.routines), [state.history, state.routines]);
  const opts: DailyOptions = { minutes: saved.minutes, focus: saved.focus, avoid: saved.avoid };
  const plan = useMemo(
    () =>
      buildDaily(
        { history: state.history, routines: state.routines, exercises: allExercises(), lookup: getExercise, rehab },
        { minutes: saved.minutes, focus: saved.focus, avoid: saved.avoid },
      ),
    // allExercises() follows the custom exercises
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.history, state.routines, state.customExercises, rehab, saved.minutes, saved.focus, saved.avoid],
  );
  const key = draftKey(plan.routine.blocks);
  const tweak = saved.tweak?.for === key ? saved.tweak : undefined;
  const shown: Routine = tweak ? { id: DAILY_ID, name: tweak.name, blocks: tweak.blocks } : plan.routine;

  const change = (p: Partial<Saved>) => {
    abort.current?.abort();
    setError(null);
    setSaved((s) => ({ ...s, ...p, tweak: undefined }));
  };
  const legsOk = !rehab || rehab.done;
  const areas = AREAS.filter((a) => a !== 'legs' || legsOk);
  const toggleAvoid = (a: Avoid) => change({ avoid: saved.avoid.includes(a) ? saved.avoid.filter((x) => x !== a) : [...saved.avoid, a] });

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const { data } = await ask<RawTweak>({
        prompt: tweakPrompt(q, shown, opts, getExercise),
        schema: TWEAK_SCHEMA,
        withToday: true,
        signal: abort.current.signal,
      });
      const t = readTweak(data, q, { draft: shown, routines: state.routines, rehab, lookup: getExercise });
      if (!t) setError('Claude’s change had nothing the app could use.');
      else {
        setSaved((s) => ({ ...s, tweak: { ...t, for: key } }));
        setText('');
      }
    } catch (e) {
      if (!abort.current.signal.aborted) setError(aiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const w = workoutFromRoutine(shown, state.history, getExercise, new Date(), (rb) => doseItems(rb, rehab, state.routines, getExercise));
    delete w.routineId;
    onStart(w);
  };

  const picked = [saved.focus && `Focus ${AVOID_LABELS[saved.focus].toLowerCase()}`, saved.avoid.length && `avoiding ${saved.avoid.length}`]
    .filter(Boolean)
    .join(' · ');
  const hasWork = shown.blocks.some((b) => !b.rehabDose);

  return (
    <div className="card today daily">
      <div className="today-label">Today</div>
      <div className="spread today-top">
        <div className="grow">
          <div className="today-name">{shown.name}</div>
          <div className="routine-meta">{tweak ? tweak.reason || plan.reason : plan.reason}</div>
        </div>
        <BodyMap load={routineMap(shown.blocks, getExercise)} size="mini" />
      </div>

      <div className="seg daily-time" role="radiogroup" aria-label="Time you have">
        {TIME_CHOICES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={saved.minutes === m}
            className={'seg-btn' + (saved.minutes === m ? ' on' : '')}
            onClick={() => change({ minutes: m })}
          >
            {m} min
          </button>
        ))}
      </div>

      <button className="link-btn small daily-more" aria-expanded={more} onClick={() => setMore((o) => !o)}>
        {more ? 'Hide focus and avoid' : picked || 'Focus or avoid something'}
      </button>
      {more && (
        <div className="daily-filters">
          <div className="daily-label">Focus</div>
          <div className="chips">
            <button className={'chip' + (!saved.focus ? ' on' : '')} onClick={() => change({ focus: undefined })}>
              Any
            </button>
            {areas.map((a) => (
              <button key={a} className={'chip' + (saved.focus === a ? ' on' : '')} onClick={() => change({ focus: a })}>
                {AVOID_LABELS[a]}
              </button>
            ))}
          </div>
          <div className="daily-label">Avoid today</div>
          <div className="chips">
            {[...areas.filter((a) => a !== saved.focus), ...KITS].map((a) => (
              <button
                key={a}
                aria-pressed={saved.avoid.includes(a)}
                className={'chip' + (saved.avoid.includes(a) ? ' on' : '')}
                onClick={() => toggleAvoid(a)}
              >
                {AVOID_LABELS[a]}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasWork ? (
        <PlanList blocks={shown.blocks} newIds={tweak ? [] : plan.newIds} />
      ) : (
        <div className="small dim daily-empty">Nothing fits those choices. Try avoiding less.</div>
      )}

      {tweak && (
        <div className="daily-tweaked small">
          <span>
            <IconSpark /> Changed: “{tweak.request}”
          </span>
          <button className="link-btn small" onClick={() => setSaved((s) => ({ ...s, tweak: undefined }))}>
            Back to the draft
          </button>
        </div>
      )}
      {tweak && tweak.dropped.length > 0 && <div className="small dim">{tweak.dropped.join(' · ')}</div>}

      {ready && (
        <form
          className="daily-ask"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <IconSpark />
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={busy ? 'Claude is changing it…' : 'Change it: “bench is taken”'}
            disabled={busy}
            enterKeyHint="send"
            aria-label="Ask Claude to change today’s workout"
          />
          <button className="icon-btn" type="submit" disabled={busy || !text.trim()} aria-label="Send">
            <IconSend />
          </button>
        </form>
      )}
      {error && <div className="error-text small">{error}</div>}

      <button className="btn btn-primary btn-block btn-lg daily-go" onClick={start} disabled={!hasWork || busy}>
        Start {shown.name}
      </button>
    </div>
  );
}
