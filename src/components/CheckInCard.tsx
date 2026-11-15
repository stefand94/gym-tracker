import { useEffect, useRef, useState } from 'react';
import {
  CHECKIN_SCHEMA,
  checkInDue,
  checkInPrompt,
  checkInStale,
  readCheckIn,
  weekKey,
  weekWorkouts,
  type RawCheckIn,
} from '../lib/helpers';
import { useStore } from '../state/store';
import { aiMessage, useClaude } from '../state/useClaude';
import { IconSpark } from './Icons';

// One automatic try per week per app session, even if it fails (no retry loops on every Home visit).
let triedWeek: string | null = null;

/**
 * Claude's look at the week: what went up, which muscles are behind, the rehab, one thing for next time.
 * Written once a week on its own (kept on this device); Refresh when a newer workout is in.
 */
export function CheckInCard() {
  const { state, dispatch } = useStore();
  const { ask, ready } = useClaude();
  const c = state.ai.checkIn;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const run = async () => {
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    const now = new Date();
    try {
      const { data } = await ask<RawCheckIn>({
        prompt: checkInPrompt(),
        schema: CHECKIN_SCHEMA,
        withToday: true,
        signal: abort.current.signal,
      });
      const checkIn = readCheckIn(data, { week: weekKey(now), at: now.toISOString(), workouts: weekWorkouts(state.history, now) });
      dispatch({ type: 'aiCheckIn', checkIn });
    } catch (e) {
      if (!abort.current.signal.aborted) setError(aiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const due = ready && checkInDue(c, state.history);
  useEffect(() => {
    const week = weekKey();
    if (!due || triedWeek === week || navigator.onLine === false) return;
    triedWeek = week;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  const current = c && c.week === weekKey() ? c : null;
  if (!ready || (!current && !busy && !error)) return null;
  const stale = current && checkInStale(current, state.history);

  return (
    <div className="card checkin-card">
      <div className="spread">
        <div className="today-label">
          <IconSpark /> This week
        </div>
        {(stale || (!current && !busy)) && (
          <button className="link-btn" onClick={() => void run()} disabled={busy}>
            {busy ? 'Updating…' : 'Refresh'}
          </button>
        )}
      </div>
      {busy && !current ? (
        <div className="small dim">Claude is looking at your week…</div>
      ) : current ? (
        <>
          <div className="checkin-head">{current.headline}</div>
          {current.behind.length > 0 && (
            <div className="checkin-behind">
              {current.behind.map((b) => (
                <span key={b} className="chip chip-static">
                  {b}
                </span>
              ))}
            </div>
          )}
          {current.next && <div className="checkin-next">Next: {current.next}</div>}
          {(current.wins.length > 0 || current.rehab) &&
            (open ? (
              <ul className="checkin-more small">
                {current.wins.map((w) => (
                  <li key={w}>↑ {w}</li>
                ))}
                {current.rehab && <li>{current.rehab}</li>}
              </ul>
            ) : (
              <button className="link-btn small" onClick={() => setOpen(true)}>
                More
              </button>
            ))}
        </>
      ) : null}
      {error && <div className="error-text small">{error}</div>}
    </div>
  );
}
