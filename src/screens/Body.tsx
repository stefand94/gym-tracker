import { useMemo, useState } from 'react';
import { BodyMap } from '../components/BodyMap';
import { getExercise } from '../data/library';
import { MUSCLE_IDS, MUSCLE_LABELS, type MuscleId } from '../data/muscles';
import { daysAgo, fmtNum } from '../lib/format';
import { balanceNote, groupSets } from '../lib/groups';
import { lastTrained, loadSince } from '../lib/muscleLoad';
import { useStore } from '../state/store';

const PERIODS = [7, 30, 90] as const;
const COLD_DAYS = 10;

function whenText(iso: string | undefined) {
  if (!iso) return 'never';
  const d = daysAgo(iso);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

export function Body() {
  const { state } = useStore();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [sel, setSel] = useState<MuscleId | null>(null);
  const load = useMemo(() => loadSince(state.history, days, getExercise), [state.history, days]);
  const last = useMemo(() => lastTrained(state.history, getExercise), [state.history]);
  const max = Math.max(0, ...Object.values(load));
  const ranked = [...MUSCLE_IDS].sort((a, b) => load[a] - load[b] || (last[a] ?? '').localeCompare(last[b] ?? ''));
  const groups = useMemo(() => groupSets(state.history, days, getExercise), [state.history, days]);
  const upper = groups.push + groups.pull;
  const pushHeavy = groups.push > groups.pull * 1.2;
  const anyHistory = state.history.some((w) => w.finishedAt);

  return (
    <div>
      <h1 className="page-title">Body</h1>
      <div className="chips" style={{ marginBottom: 12 }}>
        {PERIODS.map((p) => (
          <button key={p} className={'chip' + (days === p ? ' on' : '')} onClick={() => setDays(p)}>
            {p} days
          </button>
        ))}
      </div>
      <div className="card">
        <BodyMap load={load} size="large" labels selected={sel} onSelect={(m) => setSel(sel === m ? null : m)} />
        <div className="legend">
          <span>none</span>
          <span className="legend-bar" />
          <span className="num">{fmtNum(max)} sets</span>
        </div>
        <div className="muscle-info">
          {sel ? (
            <>
              <strong>{MUSCLE_LABELS[sel]}</strong>
              <div className="small dim num">
                {fmtNum(load[sel])} sets in {days} days · last trained {whenText(last[sel])}
              </div>
            </>
          ) : (
            <div className="small dim">{anyHistory ? 'Tap a muscle for details' : 'Finish a workout to see your heatmap'}</div>
          )}
        </div>
      </div>

      <div className="section-title">Push vs pull</div>
      <div className="card balance">
        <div className="balance-nums num">
          <span>
            <strong>{groups.push}</strong> push
          </span>
          <span>
            <strong>{groups.pull}</strong> pull
          </span>
        </div>
        <div className="balance-bar" aria-hidden>
          <div className="balance-push" style={{ flexGrow: upper ? groups.push : 1 }} />
          <div className="balance-pull" style={{ flexGrow: upper ? groups.pull : 1 }} />
        </div>
        <div className={'small' + (pushHeavy ? ' balance-warn' : ' dim')}>{balanceNote(groups.push, groups.pull)}</div>
        <div className="small dim num balance-rest">
          Also {groups.legs} legs · {groups.core} core sets in {days} days
        </div>
      </div>

      <div className="section-title">Least trained first</div>
      <div className="card list-card">
        {ranked.map((m) => {
          const cold = !last[m] || daysAgo(last[m]!) >= COLD_DAYS;
          return (
            <button key={m} className={'mrow' + (sel === m ? ' sel' : '')} onClick={() => setSel(sel === m ? null : m)}>
              <span style={{ fontWeight: 600 }}>{MUSCLE_LABELS[m]}</span>
              <span className="row" style={{ gap: 8 }}>
                <span className="mbar grow">
                  <div style={{ width: `${max ? (load[m] / max) * 100 : 0}%` }} />
                </span>
                <span className="small num dim" style={{ width: 28, textAlign: 'right' }}>
                  {fmtNum(load[m])}
                </span>
              </span>
              <span className={'when' + (cold ? ' cold' : '')}>{whenText(last[m])}</span>
            </button>
          );
        })}
      </div>
      <p className="small dim">
        Sets are weighted: a set counts 1 for the main muscles worked and ½ for secondary muscles. Muscles not trained in{' '}
        {COLD_DAYS}+ days are flagged.
      </p>
    </div>
  );
}
