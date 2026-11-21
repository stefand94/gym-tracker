import { useEffect, useRef, useState } from 'react';
import { countBeep, restOverAlert } from '../lib/alert';
import { getExercise } from '../data/library';
import { finishHolds, restsAfter } from '../lib/workout';
import { useStore, type HoldState } from '../state/store';

function clock(s: number) {
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** Re-renders 4× a second while `on`. */
function useTicker(on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [on]);
  return Date.now();
}

/** Where a hold is: getting set (counting down to go) or holding (counting down to the end). */
function holdPhase(hold: HoldState, now: number) {
  if (now < hold.goAt) return { phase: 'ready' as const, left: Math.ceil((hold.goAt - now) / 1000) };
  return {
    phase: 'hold' as const,
    left: Math.ceil((hold.endsAt - now) / 1000),
    held: Math.floor((now - hold.goAt) / 1000),
    pct: Math.min(100, ((now - hold.goAt) / (hold.endsAt - hold.goAt)) * 100),
  };
}

/** Runs the hold in progress: pips in the last 3 s of get-ready and of the hold, then ticks the set at zero. */
export function HoldWatcher() {
  const { state, dispatch } = useStore();
  const hold = state.hold;
  const now = useTicker(!!hold);
  const pipped = useRef('');

  useEffect(() => {
    if (!hold) return;
    const p = holdPhase(hold, now);
    const key = `${hold.goAt}:${p.phase}:${p.left}`;
    if (pipped.current === key) return;
    pipped.current = key;
    if (p.phase === 'ready' && p.left <= 3) countBeep();
    if (p.phase === 'hold' && p.held === 0 && now - hold.goAt < 1000) countBeep(true);
    if (p.phase === 'hold' && p.left > 0 && p.left <= 3) countBeep();
    if (p.phase === 'hold' && p.left <= 0) {
      if (now - hold.endsAt < 3000) restOverAlert();
      const w = state.active;
      dispatch({ type: 'holdStop' });
      if (!w) return;
      const at = Date.now();
      dispatch({ type: 'updateActive', fn: (x) => finishHolds(x, hold, at, getExercise).workout });
      // walk → jog → walk: the next interval starts the moment this one ended, no rest in between
      const { workout: after, next, last } = finishHolds(w, hold, at, getExercise);
      if (next)
        dispatch({
          type: 'holdStart',
          itemId: next.itemId,
          set: next.set,
          seconds: (next.endsAt - next.goAt) / 1000,
          now: next.goAt,
          lead: 0,
          side: next.side,
        });
      else if (state.prefs.rest && restsAfter(after, last.itemId, last.set)) dispatch({ type: 'restStart', now: at });
    }
  }, [hold, now, state.active, state.prefs.rest, dispatch]);

  return null;
}

/** Replaces the seconds stepper while this set's hold runs. */
export function HoldDisplay({ hold }: { hold: HoldState }) {
  const now = useTicker(true);
  const p = holdPhase(hold, now);
  if (p.phase === 'ready')
    return (
      <div className="hold ready" role="timer" aria-live="assertive">
        <span className="hold-label">{hold.side === 'R' ? 'Switch sides' : 'Get set'}</span>
        <span className="hold-time num">{p.left}</span>
      </div>
    );
  return (
    <div className="hold" role="timer">
      <div className="hold-fill" style={{ width: `${p.pct}%` }} />
      <span className="hold-label">{hold.side === 'L' ? 'Left' : hold.side === 'R' ? 'Right' : 'Hold'}</span>
      <span className="hold-time num">{clock(p.left)}</span>
    </div>
  );
}
