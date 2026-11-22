import { CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { useNavigate, useParams } from 'react-router-dom';
import { BodyMap } from '../components/BodyMap';
import { ExercisePicker } from '../components/ExercisePicker';
import { allExercises, getExercise } from '../data/library';
import { MUSCLE_LABELS } from '../data/muscles';
import { fmtDate, fmtNum, fmtSet } from '../lib/format';
import { exerciseMap } from '../lib/muscleLoad';
import { metricsFor, performedExerciseIds, series, stationsIn } from '../lib/progress';
import { recentRecords } from '../lib/records';
import { stallNow, stallText } from '../lib/stall';
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
    () => ({
      accent: cssVar('--heat'),
      lines: [cssVar('--heat'), cssVar('--rest'), cssVar('--done'), cssVar('--skip')],
      grid: cssVar('--border'),
      text: cssVar('--text-dim'),
      surface: cssVar('--surface'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme],
  );
}

export function Progress() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state } = useStore();
  const performed = useMemo(() => performedExerciseIds(state.history), [state.history]);
  const records = useMemo(() => recentRecords(state.history, getExercise), [state.history]);
  const exId = id ?? performed[0];
  const ex = exId ? getExercise(exId) : undefined;
  const [metricKey, setMetricKey] = useState('top');
  const [picking, setPicking] = useState(false);
  const colors = useColors();

  const metrics = ex ? metricsFor(ex.type) : [];
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const pts = useMemo(() => (ex && metric ? series(ex, metric, state.history) : []), [ex, metric, state.history]);
  /** One line per station once an exercise has been done on more than one (null = no station set). */
  const lines = useMemo(() => {
    if (!ex || !metric) return [];
    const stations = stationsIn(ex, state.history);
    if (stations.length < 2) return [];
    return stations.slice(0, 4).map((st) => {
      const byDate = new Map(series(ex, metric, state.history, st).map((p) => [p.date, p.value]));
      return {
        label: st ?? 'No station',
        data: pts.map((p) => byDate.get(p.date) ?? null),
      };
    });
  }, [ex, metric, state.history, pts]);

  const sessions = useMemo(() => {
    if (!ex) return [];
    return state.history
      .filter((w) => w.finishedAt)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .map((w) => ({
        w,
        items: w.blocks.flatMap((b) => b.items).filter((i) => i.exerciseId === ex.id && i.status !== 'skipped'),
      }))
      .map(({ w, items }) => ({
        w,
        sets: items.flatMap((i) => i.sets.filter((s) => s.done)),
        stations: [...new Set(items.flatMap((i) => (i.station ? [i.station] : [])))],
      }))
      .filter((x) => x.sets.length)
      .slice(0, 10);
  }, [ex, state.history]);

  const stuck = useMemo(() => (ex ? stallNow(ex, state.history, state.routines) : null), [ex, state.history, state.routines]);
  const stuckDates = new Set(stuck?.sessions.map((p) => p.workout.startedAt));
  const pointColor = pts.map((p) => (stuckDates.has(p.date) ? colors.text : colors.accent));

  const best = pts.length ? Math.max(...pts.map((p) => p.value)) : null;
  /** Holds and reps start from zero; weights get at least ±10% so a flat line doesn't look precise. */
  const yRange = useMemo(() => {
    const vals = (lines.length ? lines.flatMap((l) => l.data) : pts.map((p) => p.value)).filter((v): v is number => v != null);
    if (!vals.length || !metric) return {};
    if (metric.unit !== 'kg') return { beginAtZero: true };
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.1, hi * 0.1, 1);
    return { suggestedMin: Math.max(0, lo - pad), suggestedMax: hi + pad };
  }, [lines, pts, metric]);
  const first = pts[0]?.value;
  const latest = pts[pts.length - 1]?.value;

  return (
    <div>
      <h1 className="page-title">Progress</h1>

      <button type="button" className="card prog-pick" onClick={() => setPicking(true)}>
        {ex && <BodyMap load={exerciseMap(ex)} scaleMax={1} size="mini" />}
        <div className="grow">
          <div className="small dim">Exercise</div>
          <div className="routine-name">{ex?.name ?? 'Choose an exercise'}</div>
          {ex && <div className="routine-meta">{ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}</div>}
        </div>
        <span className="small prog-change">{ex ? 'Change' : 'Choose'}</span>
      </button>

      {performed.length > 1 && (
        <div className="chips prog-recent">
          {performed.slice(0, 12).map((pid) => (
            <button key={pid} className={'chip' + (pid === exId ? ' on' : '')} onClick={() => nav(`/progress/${pid}`, { replace: true })}>
              {getExercise(pid)?.name ?? pid}
            </button>
          ))}
        </div>
      )}

      {ex && metric && (
        <>
          <div className="chips prog-metrics">
            {metrics.map((m) => (
              <button key={m.key} className={'chip' + (m.key === metric.key ? ' on' : '')} onClick={() => setMetricKey(m.key)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="stat-grid prog-stats">
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

          {stuck && (
            <div className="card stall-note">
              <span className="goup-tag stall-tag">Stuck</span>
              <div className="grow small">
                {stallText(stuck.stall)[0].toUpperCase() + stallText(stuck.stall).slice(1)}
                {!lines.length && ' (the grey points)'}. Next time you do it, the card offers a fix.
              </div>
            </div>
          )}

          <div className="card">
            {pts.length ? (
              <>
                <div className="chart-box">
                  <Line
                    data={{
                      labels: pts.map((p) => fmtDate(p.date, { day: 'numeric', month: 'short' })),
                      datasets: lines.length
                        ? lines.map((l, n) => {
                            const c = colors.lines[n % colors.lines.length];
                            return {
                              label: l.label,
                              data: l.data,
                              borderColor: c,
                              backgroundColor: c,
                              pointBackgroundColor: c,
                              pointBorderColor: colors.surface,
                              pointBorderWidth: 2,
                              pointRadius: 4,
                              pointHoverRadius: 6,
                              borderWidth: 2.5,
                              tension: 0.25,
                              spanGaps: true,
                            };
                          })
                        : [
                            {
                              data: pts.map((p) => p.value),
                              borderColor: colors.accent,
                              backgroundColor: `${colors.accent}2e`,
                              pointBackgroundColor: pointColor,
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
                        tooltip: {
                          callbacks: {
                            label: (c) =>
                              `${lines.length ? `${c.dataset.label}: ` : `${metric.label}: `}${fmtNum(c.parsed.y ?? undefined)} ${metric.unit}`,
                          },
                        },
                      },
                      scales: {
                        x: {
                          grid: { display: false },
                          ticks: {
                            color: colors.text,
                            font: { size: 13 },
                            maxRotation: 0,
                            autoSkipPadding: 12,
                          },
                        },
                        y: {
                          grid: { color: colors.grid },
                          border: { display: false },
                          ticks: { color: colors.text, precision: 0, font: { size: 13 } },
                          ...yRange,
                        },
                      },
                    }}
                  />
                </div>
                {lines.length > 0 && (
                  <div className="chart-legend">
                    {lines.map((l, n) => (
                      <span key={l.label}>
                        <i
                          style={{
                            background: colors.lines[n % colors.lines.length],
                          }}
                        />
                        {l.label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">No completed sets for {ex.name} yet.</div>
            )}
          </div>

          {sessions.length > 0 && (
            <>
              <div className="section-title">Recent sessions</div>
              <div className="card list-card">
                {sessions.map(({ w, sets, stations }) => (
                  <div key={w.id} className="list-row prog-session">
                    <div className="small dim prog-date">{fmtDate(w.startedAt, { day: 'numeric', month: 'short' })}</div>
                    <div className="hist-sets grow">
                      {stations.map((st) => (
                        <span key={st} className="station-tag">
                          📍 {st}
                        </span>
                      ))}
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

      {!ex && (
        <div className="card empty">
          <p>Finish a workout to start tracking progress, or look at any exercise.</p>
          <button className="btn btn-primary empty-go" onClick={() => setPicking(true)}>
            Choose an exercise
          </button>
        </div>
      )}

      {records.length > 0 && (
        <>
          <div className="section-title">Recent records</div>
          <div className="card list-card">
            {records.map((r) => {
              const rx = getExercise(r.exerciseId);
              return (
                <button
                  key={`${r.workoutId}-${r.exerciseId}-${r.station ?? ''}`}
                  type="button"
                  className="list-row records-link"
                  onClick={() => nav(`/progress/${r.exerciseId}`, { replace: true })}
                >
                  <div className="small dim prog-date">{fmtDate(r.date, { day: 'numeric', month: 'short' })}</div>
                  <div className="grow">
                    <div style={{ fontWeight: 700 }}>{rx?.name ?? r.exerciseId}</div>
                    {r.station && <div className="small dim">📍 {r.station}</div>}
                  </div>
                  <span className="hist-set pr">
                    {fmtSet(rx, r.set)}
                    <span className="pr-badge">PR</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

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
      {allExercises().length === 0 && <div className="empty">No exercises in the library.</div>}
    </div>
  );
}
