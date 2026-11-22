import { Link } from 'react-router-dom';
import { useOnline } from '../state/useOnline';
import { useStore } from '../state/store';

/**
 * GitHub is the only backup, so Home says so when it isn't working: a sync error, changes stuck while offline, or
 * no connection at all once there's history to lose. Nothing shows while all is well.
 */
export function SyncAlert() {
  const { state } = useStore();
  const online = useOnline();
  const { sync, settings, history } = state;
  const pending = sync.queue.length;
  const changes = `${pending} change${pending === 1 ? '' : 's'}`;

  let text: string | null = null;
  let fix = false;
  if (!settings.token) {
    if (history.length) {
      text = 'Your workouts are only on this phone. Connect GitHub to back them up.';
      fix = true;
    }
  } else if (sync.error && !sync.busy) {
    text = pending ? `Sync isn't working, so ${changes} are only on this phone.` : `Sync isn't working: ${sync.error}`;
    fix = true;
  } else if (pending && !online) {
    text = `Offline: ${changes} will sync when you're back online.`;
  }
  if (!text) return null;
  return (
    <div className={'sync-alert' + (fix ? ' warn' : '')} role="status">
      <span className="grow">{text}</span>
      {fix && (
        <Link to="/settings" className="sync-alert-fix">
          Fix
        </Link>
      )}
    </div>
  );
}
