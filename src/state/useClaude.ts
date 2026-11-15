import { useCallback, useMemo } from 'react';
import { allExercises, getExercise } from '../data/library';
import { stableContext, todayContext } from '../lib/aiContext';
import { AiError, callJson, toAiError, type JsonCall, type JsonResult, type ModelKey } from '../lib/claude';
import { rehabState } from '../lib/rehab';
import { useStore } from './store';

export interface AskOptions {
  prompt: string;
  schema: Record<string, unknown>;
  /** 'ask' uses the model chosen in Settings; everything else runs on Haiku. */
  use?: 'ask' | 'quick';
  /** Send today's data (history, routines, muscle load, rehab) as well as the catalogue. */
  withToday?: boolean;
  effort?: JsonCall['effort'];
  signal?: AbortSignal;
}

/**
 * In development only, `window.__claudeMock = (call) => data` answers instead of the API, so screens
 * can be tried without a key. Never used in the built app.
 */
type Mock = (c: { prompt: string; today?: string; model: ModelKey }) => unknown;
const devMock = (): Mock | undefined => (import.meta.env.DEV ? (window as unknown as { __claudeMock?: Mock }).__claudeMock : undefined);

/** Calls Claude with the app's context and counts what it cost. */
export function useClaude() {
  const { state, dispatch } = useStore();
  const { key, askModel } = state.ai;
  // allExercises() reads the library, which takes in the custom exercises: rebuild when they change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => stableContext(allExercises()), [state.customExercises]);

  const ask = useCallback(
    async <T>(o: AskOptions): Promise<JsonResult<T>> => {
      const model: ModelKey = o.use === 'ask' ? askModel : 'haiku';
      const today = o.withToday
        ? todayContext({
            history: state.history,
            routines: state.routines,
            rehab: rehabState(state.history, state.routines),
            lookup: getExercise,
          })
        : undefined;
      const mock = devMock();
      if (mock) {
        await new Promise((r) => setTimeout(r, 400));
        return { data: mock({ prompt: o.prompt, today, model }) as T, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model };
      }
      try {
        const res = await callJson<T>({
          apiKey: key,
          model,
          stable,
          today,
          prompt: o.prompt,
          schema: o.schema,
          effort: o.effort,
          signal: o.signal,
        });
        dispatch({ type: 'aiUsage', model, usage: res.usage });
        return res;
      } catch (e) {
        const err = toAiError(e);
        if (err.usage) dispatch({ type: 'aiUsage', model, usage: err.usage });
        throw err;
      }
    },
    [key, askModel, stable, state.history, state.routines, dispatch],
  );

  return { ask, ready: !!key.trim() || !!devMock() };
}

export const aiMessage = (e: unknown) => (e instanceof AiError ? e.message : toAiError(e).message);
