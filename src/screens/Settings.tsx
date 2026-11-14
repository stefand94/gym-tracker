import { useRef, useState } from 'react';
import { ConfirmSheet } from '../components/Sheet';
import { fmtDate } from '../lib/format';
import { testConnection } from '../lib/sync';
import { useStore } from '../state/store';
import type { Workout } from '../types';

export function Settings({ syncNow }: { syncNow: () => void }) {
  const { state, dispatch } = useStore();
  const { settings, sync } = state;
  const [token, setToken] = useState(settings.token);
  const [repo, setRepo] = useState(`${settings.owner}/${settings.repo}`);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [askDisconnect, setAskDisconnect] = useState(false);

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
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history: state.history, routines: state.routines, customExercises: state.customExercises }, null, 2)], {
      type: 'application/json',
    });
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
      alert(`Imported ${history.length} workouts (duplicates skipped).`);
    } catch (e) {
      alert(`Import failed: ${e instanceof Error ? e.message : e}`);
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
        {sync.lastSync && <div className="small dim">Last synced {fmtDate(sync.lastSync, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>}
        {sync.error && <div className="error-text">{sync.error}</div>}
        <button className="btn btn-block" disabled={!connected || sync.busy} onClick={syncNow}>
          Sync now
        </button>
      </div>

      <div className="section-title">GitHub connection</div>
      <div className="card stack">
        <label className="field">
          <span>Data repository</span>
          <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="field">
          <span>Personal access token</span>
          <input
            className="input"
            type="password"
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
          <button
            className="btn btn-ghost btn-danger btn-block btn-sm"
            onClick={() => setAskDisconnect(true)}
          >
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
          <summary className="small" style={{ fontWeight: 650, cursor: 'pointer' }}>
            How to create a token
          </summary>
          <ol className="steps">
            <li>
              On GitHub go to <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and tap{' '}
              <b>Generate new token</b>.
            </li>
            <li>Name it e.g. <code>gym-tracker phone</code> and pick an expiration (up to 1 year, or no expiry).</li>
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
      </div>

      <p className="small dim" style={{ textAlign: 'center', marginTop: 24 }}>
        Gym Tracker · v{__APP_VERSION__}
      </p>
    </div>
  );
}
