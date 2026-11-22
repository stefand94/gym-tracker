import { useRef, useState } from 'react';
import { BodyMap } from '../components/BodyMap';
import { ExerciseEditor } from '../components/ExerciseEditor';
import { ConfirmSheet } from '../components/Sheet';
import { MUSCLE_LABELS } from '../data/muscles';
import { exerciseMap } from '../lib/muscleLoad';
import { fmtDate } from '../lib/format';
import { checkKey, MODEL_LABELS, type ModelKey } from '../lib/claude';
import { testConnection } from '../lib/sync';
import { useStore } from '../state/store';
import type { Exercise, Workout } from '../types';
import { APP_VERSION } from '../version';

export function Settings({ syncNow }: { syncNow: () => void }) {
  const { state, dispatch } = useStore();
  const { settings, sync } = state;
  const [token, setToken] = useState(settings.token);
  const [repo, setRepo] = useState(`${settings.owner}/${settings.repo}`);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [askDisconnect, setAskDisconnect] = useState(false);
  const [imported, setImported] = useState<{ ok: boolean; msg: string } | null>(null);
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const mine = [...state.customExercises].sort((a, b) => a.name.localeCompare(b.name));

  const save = async () => {
    const [owner, name] = repo.trim().split('/');
    if (!owner || !name) {
      setTest({ ok: false, msg: 'Repo should look like owner/name' });
      return;
    }
    const next = { ...settings, token: token.trim(), owner, repo: name };
    setTest({ ok: true, msg: 'Checking…' });
    try {
      const full = await testConnection(next);
      dispatch({ type: 'settings', settings: next });
      setTest({ ok: true, msg: `Connected to ${full}` });
      setTimeout(syncNow, 0);
    } catch (e) {
      setTest({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            history: state.history,
            routines: state.routines,
            customExercises: state.customExercises,
          },
          null,
          2,
        ),
      ],
      {
        type: 'application/json',
      },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gym-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const history: Workout[] = Array.isArray(data) ? data : data.history;
      if (!Array.isArray(history)) throw new Error('No workouts found in file');
      dispatch({ type: 'restore', history });
      setImported({ ok: true, msg: `Imported ${history.length} workouts (duplicates skipped).` });
    } catch (e) {
      setImported({ ok: false, msg: `Import failed: ${e instanceof Error ? e.message : e}` });
    }
  };

  const connected = !!settings.token;
  const pending = sync.queue.length;
  const statusCls = !connected ? '' : sync.error ? 'warn' : pending ? 'warn' : 'ok';
  const statusText = !connected
    ? 'Not connected — data only on this device'
    : sync.busy
      ? 'Syncing…'
      : sync.error
        ? 'Sync problem'
        : pending
          ? `${pending} change${pending > 1 ? 's' : ''} waiting to sync`
          : 'All synced';

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="section-title">Sync</div>
      <div className="card stack">
        <div className={'status-pill ' + statusCls}>{statusText}</div>
        {sync.lastSync && (
          <div className="small dim">
            Last synced {fmtDate(sync.lastSync, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
        {sync.error && <div className="error-text">{sync.error}</div>}
        <button className="btn btn-block" disabled={!connected || sync.busy} onClick={syncNow}>
          Sync now
        </button>
      </div>

      <div className="section-title">Your exercises</div>
      <div className="card custom-list">
        {mine.length === 0 && <div className="small dim">Exercises you create show up here. Claude checks their muscles later.</div>}
        {mine.map((e) => (
          <button key={e.id} className="picker-item" onClick={() => setEditing(e)}>
            <BodyMap load={exerciseMap(e)} scaleMax={1} size="mini" />
            <div className="grow picker-text">
              <div className="picker-name">{e.name}</div>
              <div className="picker-meta">
                {[e.equipment, e.primary.map((m) => MUSCLE_LABELS[m]).join(', ') || 'no muscles yet'].join(' · ')}
                {e.reviewed ? ' · checked' : ''}
              </div>
            </div>
          </button>
        ))}
        <button className="picker-create" onClick={() => setEditing('new')}>
          <span className="picker-create-plus">+</span>
          New exercise
        </button>
      </div>
      {editing && (
        <ExerciseEditor
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      <ClaudeSettings />

      <div className="section-title">GitHub connection</div>
      <div className="card stack">
        <label className="field">
          <span>Data repository</span>
          <input
            className="input"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Personal access token</span>
          <input
            type="text"
            className="input secret"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button className="btn btn-primary btn-block" onClick={save} disabled={!token.trim()}>
          Save & test connection
        </button>
        {test && <div className={test.ok ? 'small dim' : 'error-text'}>{test.msg}</div>}
        {connected && (
          <button className="btn btn-ghost btn-danger btn-block btn-sm" onClick={() => setAskDisconnect(true)}>
            Disconnect
          </button>
        )}
        {askDisconnect && (
          <ConfirmSheet
            title="Disconnect sync?"
            body="Workouts stay on this device but stop syncing to GitHub."
            confirmLabel="Disconnect"
            danger
            onConfirm={() => {
              dispatch({ type: 'settings', settings: { token: '' } });
              setToken('');
              setTest(null);
              setAskDisconnect(false);
            }}
            onClose={() => setAskDisconnect(false)}
          />
        )}
        <details>
          <summary className="small disclose">How to create a token</summary>
          <ol className="steps">
            <li>
              On GitHub go to <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and tap{' '}
              <b>Generate new token</b>.
            </li>
            <li>
              Name it e.g. <code>gym-tracker phone</code> and pick an expiration (up to 1 year, or no expiry).
            </li>
            <li>
              Repository access: <b>Only select repositories</b> → <code>{repo}</code>.
            </li>
            <li>
              Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else.
            </li>
            <li>Generate, copy the token, paste it above and tap Save.</li>
          </ol>
          <p className="small dim">The token is stored only in this browser on this device. It can only touch your data repo.</p>
        </details>
      </div>

      <div className="section-title">Backup</div>
      <div className="card stack">
        <div className="small dim">
          {state.history.length} workout{state.history.length === 1 ? '' : 's'} stored on this device.
        </div>
        <div className="row">
          <button className="btn grow" onClick={exportJson}>
            Export JSON
          </button>
          <button className="btn grow" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
        {imported && (
          <div className={imported.ok ? 'small dim' : 'error-text'} role="status">
            {imported.msg}
          </div>
        )}
      </div>

      <p className="small dim settings-version">
        Gym Tracker v{APP_VERSION} · built {__APP_VERSION__}
      </p>
    </div>
  );
}

const usd = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(2)}`);
const tokens = (x: number) => (x >= 1_000_000 ? `${(x / 1_000_000).toFixed(1)}M` : x >= 1000 ? `${Math.round(x / 1000)}k` : `${x}`);

/** Claude: the user's own API key (kept on this device only), which model Ask uses, and what it has cost. */
function ClaudeSettings() {
  const { state, dispatch } = useStore();
  const { ai } = state;
  const [key, setKey] = useState(ai.key);
  const [check, setCheck] = useState<{ ok: boolean; msg: string } | null>(null);
  const [askRemove, setAskRemove] = useState(false);

  const save = async () => {
    setCheck({ ok: true, msg: 'Checking…' });
    try {
      await checkKey(key);
      dispatch({ type: 'aiSettings', ai: { key: key.trim() } });
      setCheck({ ok: true, msg: 'Key works — Claude is ready.' });
    } catch (e) {
      setCheck({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <>
      <div className="section-title">Claude</div>
      <div className="card stack">
        <div className={'status-pill ' + (ai.key ? 'ok' : '')}>
          {ai.key ? 'Claude is on' : 'Off — add an API key to use notes, Ask and check-ins'}
        </div>
        <label className="field">
          <span>API key</span>
          <input
            type="text"
            className="input secret"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button className="btn btn-primary btn-block" onClick={save} disabled={!key.trim() || key.trim() === ai.key}>
          Save & check key
        </button>
        {check && <div className={check.ok ? 'small dim' : 'error-text'}>{check.msg}</div>}

        <div className="field">
          <span>Model for Ask</span>
          <div className="seg seg-2" role="radiogroup">
            {(Object.keys(MODEL_LABELS) as ModelKey[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={ai.askModel === m}
                className={'seg-btn' + (ai.askModel === m ? ' on' : '')}
                onClick={() => dispatch({ type: 'aiSettings', ai: { askModel: m } })}
              >
                {MODEL_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="small dim">
            Haiku is fast and costs a fraction of a cent a question. Sonnet plans more carefully for about 20× the price. Notes and
            check-ins always use Haiku.
          </div>
        </div>

        <div className="ai-spent">
          <div className="grow">
            <div>
              <b>{usd(ai.spent.usd)}</b> <span className="dim">spent</span>
            </div>
            <div className="small dim">
              {ai.spent.calls} call{ai.spent.calls === 1 ? '' : 's'} · {tokens(ai.spent.input)} in / {tokens(ai.spent.output)} out since{' '}
              {fmtDate(ai.spent.since, { day: 'numeric', month: 'short' })}
            </div>
          </div>
          {ai.spent.calls > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'aiUsageReset', now: new Date().toISOString() })}>
              Reset
            </button>
          )}
        </div>

        {ai.key && (
          <button className="btn btn-ghost btn-danger btn-block btn-sm" onClick={() => setAskRemove(true)}>
            Remove key
          </button>
        )}
        {askRemove && (
          <ConfirmSheet
            title="Remove the Claude key?"
            body="Notes stay as notes; Ask and check-ins turn off on this device."
            confirmLabel="Remove"
            danger
            onConfirm={() => {
              dispatch({ type: 'aiSettings', ai: { key: '' } });
              setKey('');
              setCheck(null);
              setAskRemove(false);
            }}
            onClose={() => setAskRemove(false)}
          />
        )}
        <details>
          <summary className="small disclose">How to get a key</summary>
          <ol className="steps">
            <li>
              Go to <b>console.anthropic.com</b>, sign in, and add a little credit under <b>Billing</b> ($5 lasts a long time on Haiku).
            </li>
            <li>
              Under <b>Limits</b>, set a monthly spend limit (e.g. $5) so a mistake can never cost much.
            </li>
            <li>
              Under <b>API keys</b>, create a key named e.g. <code>gym-tracker phone</code>, copy it, paste it above and tap Save.
            </li>
          </ol>
          <p className="small dim">
            The key is stored only in this browser on this device and is sent only to Anthropic. It never goes into either GitHub repo.
          </p>
        </details>
      </div>
    </>
  );
}
