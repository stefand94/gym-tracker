import { useCallback, useEffect, useRef } from 'react';
import { runSync } from '../lib/sync';
import { useStore } from './store';

/** Runs the sync queue + pull on mount, when coming back online, when the app regains focus, and when the queue grows. */
export function useSync() {
  const { state, dispatch } = useStore();
  const ref = useRef(state);
  ref.current = state;
  const running = useRef(false);

  const sync = useCallback(async () => {
    const s = ref.current;
    if (running.current || !s.settings.token || !navigator.onLine) return;
    running.current = true;
    dispatch({ type: 'syncStart' });
    const result = await runSync(s.settings, s.sync.queue, s.history);
    if (result.pulled.length) dispatch({ type: 'merge', workouts: result.pulled });
    if (result.error) dispatch({ type: 'syncError', error: result.error, completed: result.completed });
    else dispatch({ type: 'syncDone', completed: result.completed, at: new Date().toISOString() });
    running.current = false;
  }, [dispatch]);

  useEffect(() => {
    sync();
    const onVisible = () => document.visibilityState === 'visible' && sync();
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  const queueLen = state.sync.queue.length;
  const token = state.settings.token;
  useEffect(() => {
    if (queueLen > 0) sync();
  }, [queueLen, token, sync]);

  return sync;
}
