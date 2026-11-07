import { useEffect, useRef, useState } from 'react';
import { primeAudio, restOverAlert } from '../lib/alert';
import { useStore } from '../state/store';
import { IconChevronUp, IconTimer } from './Icons';

function clock(s: number) {
  const v = Math.max(0, s);
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/** Seconds left on the running rest (re-renders 4× a second while one is running). */
function useRestClock() {
  const { state } = useStore();
  const rest = state.rest;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [rest]);
  // read the clock on every render so a fresh rest never shows a stale time
  const left = rest ? Math.ceil((rest.endsAt - Date.now()) / 1000) : 0;
  return { rest, left, over: !!rest && left <= 0 };
}

/**
 * Header button. Not resting: turns the rest timer on/off.
 * Resting with the bar minimised: shows the countdown; tap to bring the bar back.
 */
export function TimerButton() {
  const { state, dispatch } = useStore();
  const { rest, left, over } = useRestClock();
  const { prefs } = state;
  if (rest && prefs.restMini)
    return (
      <button
        type="button"
        className={'icon-btn icon-btn-box on timer-btn counting' + (over ? ' over' : '')}
        aria-label={`Resting, ${clock(left)} left. Show timer`}
        onClick={() => dispatch({ type: 'prefs', prefs: { restMini: false } })}
      >
        <IconTimer />
        <span className="num">{clock(left)}</span>
      </button>
    );
  return (
    <button
      type="button"
      className={'icon-btn icon-btn-box timer-btn' + (prefs.rest ? ' on' : '')}
      aria-pressed={prefs.rest}
      aria-label={prefs.rest ? 'Rest timer on. Turn off' : 'Rest timer off. Turn on'}
      onClick={() => {
        primeAudio();
        dispatch({ type: 'prefs', prefs: { rest: !prefs.rest } });
      }}
    >
      <IconTimer />
    </button>
  );
}

/** Countdown under the workout header while resting. Alerts at zero, then clears itself. */
export function RestBar() {
  const { state, dispatch } = useStore();
  const { rest, left, over } = useRestClock();
  const fired = useRef<number | null>(null);

  useEffect(() => {
    if (!rest) return;
    if (left <= 0 && fired.current !== rest.endsAt) {
      fired.current = rest.endsAt;
      if (left > -3) restOverAlert();
    }
    if (left <= -5) dispatch({ type: 'restStop' });
  }, [left, rest, dispatch]);

  if (!rest || state.prefs.restMini) return null;
  const pct = over ? 0 : Math.min(100, (left / rest.total) * 100);
  const adjust = (seconds: number) => dispatch({ type: 'restAdjust', seconds, now: Date.now() });

  return (
    <div className={'rest' + (over ? ' over' : '')} role="timer" aria-live={over ? 'assertive' : 'off'}>
      <div className="rest-fill" style={{ width: `${pct}%` }} />
      <span className="rest-label">{over ? 'Go' : 'Rest'}</span>
      <span className="rest-time num">{clock(left)}</span>
      {!over && (
        <>
          <button type="button" aria-label="15 seconds less rest" onClick={() => adjust(-15)}>
            −15
          </button>
          <button type="button" aria-label="15 seconds more rest" onClick={() => adjust(15)}>
            +15
          </button>
        </>
      )}
      <button type="button" onClick={() => dispatch({ type: 'restStop' })}>
        {over ? 'OK' : 'Skip'}
      </button>
      <button
        type="button"
        className="rest-min"
        aria-label="Minimise timer to the header"
        onClick={() => dispatch({ type: 'prefs', prefs: { restMini: true } })}
      >
        <IconChevronUp />
      </button>
    </div>
  );
}
