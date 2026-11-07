import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExercisePicker } from '../components/ExercisePicker';
import { EXERCISES, getExercise } from '../data/library';
import { MUSCLE_LABELS } from '../data/muscles';
import { fmtDate, fmtNum, fmtSet } from '../lib/format';
import { exerciseMap } from '../lib/muscleLoad';
import { metricsFor, performedExerciseIds, series } from '../lib/progress';
import { useStore } from '../state/store';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useColors() {
  const [scheme, setScheme] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setScheme(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return useMemo(
    () => ({ accent: cssVar('--heat'), grid: cssVar('--border'), text: cssVar('--text-dim'), surface: cssVar('--surface') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme],
  );
}

export function Progress() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state } = useStore();
  const performed = useMemo(() => performedExerciseIds(state.history), [state.history]);
  const exId = id ?? performed[0];
  const ex = exId ? getExercise(exId) : undefined;
  const [metricKey, setMetricKey] = useState('top');
  const [picking, setPicking] = useState(false);
  const colors = useColors();

  const metrics = ex ? metricsFor(ex.type) : [];
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const pts = useMemo(() => (ex && metric ? series(ex, metric, state.history) : []), [ex, metric, state.history]);

  const sessions = useMemo(() => {
    if (!ex) return [];
    return state.history
      .filter((w) => w.finishedAt)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .map((w) => ({
        w,
        sets: w.blocks.flatMap((b) => b.items).filter((i) => i.exerciseId === ex.id && i.status !== 'skipped').flatMap((i) => i.sets.filter((s) => s.done)),
      }))
      .filter((x) => x.sets.length)
      .slice(0, 10);
  }, [ex, state.history]);

  const best = pts.length ? Math.max(...pts.map((p) => p.value)) : null;
  const first = pts[0]?.value;
  const latest = pts[pts.length - 1]?.value;

  return (
    <div>
      <h1 className="page-title">Progress</h1>

      <button className="card routine" onClick={() => setPicking(true)}>
        {ex && <BodyMap load={exerciseMap(ex)} scaleMax={1} size="mini" />}
        <div className="grow">
          <div className="small dim">Exercise</div>
          <div className="routine-name">{ex?.name ?? 'Choose an exercise'}</div>
          {ex && <div className="routine-meta">{ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}</div>}
        </div>
        <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          Change
        </span>
      </button>

      {performed.length > 1 && (
        <div className="chips" style={{ marginTop: 10, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>
          {performed.slice(0, 12).map((pid) => (
            <button key={pid} className={'chip' + (pid === exId ? ' on' : '')} style={{ flexShrink: 0 }} onClick={() => nav(`/progress/${pid}`, { replace: true })}>
              {getExercise(pid)?.name ?? pid}
            </button>
          ))}
        </div>
      )}

      {ex && metric && (
        <>
          <div className="chips" style={{ margin: '16px 0 10px' }}>
            {metrics.map((m) => (
              <button key={m.key} className={'chip' + (m.key === metric.key ? ' on' : '')} onClick={() => setMetricKey(m.key)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="stat-grid" style={{ marginBottom: 10 }}>
            <div className="stat">
              <div className="stat-v">{fmtNum(latest ?? undefined)}</div>
              <div className="stat-l">latest {metric.unit}</div>
            </div>
            <div className="stat">
              <div className="stat-v">{fmtNum(best ?? undefined)}</div>
              <div className="stat-l">best {metric.unit}</div>
            </div>
            <div className="stat">
              <div className="stat-v">
                {first !== undefined && latest !== undefined ? `${latest - first >= 0 ? '+' : ''}${fmtNum(latest - first)}` : '–'}
              </div>
              <div className="stat-l">since first</div>
            </div>
          </div>

          <div className="card">
            {pts.length ? (
              <div className="chart-box">
                <Line
                  data={{
                    labels: pts.map((p) => fmtDate(p.date, { day: 'numeric', month: 'short' })),
                    datasets: [
                      {
                        data: pts.map((p) => p.value),
                        borderColor: colors.accent,
                        backgroundColor: `${colors.accent}2e`,
                        pointBackgroundColor: colors.accent,
                        pointBorderColor: colors.surface,
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        borderWidth: 2.5,
                        tension: 0.25,
                        fill: true,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      tooltip: { callbacks: { label: (c) => `${metric.label}: ${fmtNum(c.parsed.y ?? undefined)} ${metric.unit}` } },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: colors.text, maxRotation: 0, autoSkipPadding: 12 } },
                      y: { grid: { color: colors.grid }, border: { display: false }, ticks: { color: colors.text, precision: 0 }, beginAtZero: false },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="empty">No completed sets for {ex.name} yet.</div>
            )}
          </div>

          {sessions.length > 0 && (
            <>
              <div className="section-title">Recent sessions</div>
              <div className="card list-card">
                {sessions.map(({ w, sets }) => (
                  <div key={w.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="small dim" style={{ width: 64, flexShrink: 0 }}>
                      {fmtDate(w.startedAt, { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="hist-sets grow">
                      {sets.map((s, k) => (
                        <span key={k} className="hist-set">
                          {fmtSet(ex, s)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!ex && <div className="card empty">Finish a workout to start tracking progress, or pick any exercise above.</div>}

      {picking && (
        <ExercisePicker
          title="Choose exercise"
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false);
            nav(`/progress/${e.id}`, { replace: true });
          }}
        />
      )}
      {EXERCISES.length === 0 && <div className="empty">No exercises in the library.</div>}
    </div>
  );
}
