import type Anthropic from '@anthropic-ai/sdk';

/** Haiku does everything by default; Ask can be moved to Sonnet in Settings. */
const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' } as const;
export type ModelKey = keyof typeof MODELS;
export const MODEL_LABELS: Record<ModelKey, string> = { haiku: 'Haiku 5.5', sonnet: 'Sonnet 5.5' };

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** US$ per million tokens: input, output, cache read, cache write (5-minute). */
const PRICE: Record<ModelKey, { in: number; out: number; read: number; write: number }> = {
  haiku: { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
  sonnet: { in: 2, out: 10, read: 0.1, write: 2.5 },
};

export function costUsd(model: ModelKey, u: TokenUsage): number {
  const p = PRICE[model];
  return (u.input * p.in + u.output * p.out + u.cacheRead * p.read + u.cacheWrite * p.write) / 1_000_000;
}

export type AiErrorKind = 'nokey' | 'offline' | 'auth' | 'rate' | 'busy' | 'refused' | 'cutoff' | 'bad' | 'other';

const MESSAGES: Record<AiErrorKind, string> = {
  nokey: 'Add your Claude API key in Settings first.',
  offline: "You're offline — your note is saved and Claude can look at it later.",
  auth: 'Claude rejected the API key. Check it in Settings.',
  rate: 'Too many requests right now — try again in a minute.',
  busy: 'Claude is busy right now — try again in a moment.',
  refused: "Claude wouldn't answer that one.",
  cutoff: 'The answer came back cut short — try asking for less.',
  bad: 'Claude sent back something the app could not read.',
  other: 'Something went wrong talking to Claude.',
};

export class AiError extends Error {
  /** Tokens spent before it failed (a refusal or cut-off answer still costs). */
  usage?: TokenUsage;
  constructor(
    public kind: AiErrorKind,
    message = MESSAGES[kind],
  ) {
    super(message);
  }
}

/**
 * Turn whatever a call threw into an AiError with a message fit for the screen. Goes by HTTP status (the SDK
 * is loaded lazily, so its error classes aren't to hand for instanceof).
 */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const status = typeof e === 'object' && e !== null ? (e as { status?: unknown }).status : undefined;
  const msg = e instanceof Error ? e.message : '';
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return new AiError('auth');
    if (status === 429) return new AiError('rate');
    if (status >= 500) return new AiError('busy');
    if (status === 400) return new AiError('bad', `Claude couldn't take that request: ${msg}`);
    return new AiError('other', `Claude error ${status}: ${msg}`);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new AiError('offline');
  return new AiError('other', msg ? `Couldn't reach Claude: ${msg}` : undefined);
}

let cached: { key: string; client: Anthropic } | null = null;
/** The SDK is only downloaded the first time Claude is used, so the app opens as fast as before. */
async function client(apiKey: string): Promise<Anthropic> {
  if (cached?.key !== apiKey) {
    const { default: Sdk } = await import('@anthropic-ai/sdk');
    // The key is the user's own, typed into this device; the browser talks to the API directly.
    cached = { key: apiKey, client: new Sdk({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) };
  }
  return cached.client;
}

export interface JsonCall {
  apiKey: string;
  model: ModelKey;
  /** Instructions and the exercise catalogue: the same on every call, so it's cached. */
  stable: string;
  /** Today's data (history, routines, muscle load): changes between calls. */
  today?: string;
  prompt: string;
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface JsonResult<T> {
  data: T;
  usage: TokenUsage;
  model: ModelKey;
}

/** One request whose answer is JSON matching `schema` (structured outputs). Throws AiError. */
export async function callJson<T>(c: JsonCall): Promise<JsonResult<T>> {
  if (!c.apiKey.trim()) throw new AiError('nokey');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('offline');
  let res: Anthropic.Message;
  try {
    res = await (
      await client(c.apiKey.trim())
    ).messages.create(
      {
        model: MODELS[c.model],
        max_tokens: c.maxTokens ?? 16000,
        system: [
          { type: 'text', text: c.stable, cache_control: { type: 'ephemeral' } },
          ...(c.today ? [{ type: 'text' as const, text: c.today }] : []),
        ],
        messages: [{ role: 'user', content: c.prompt }],
        output_config: { effort: c.effort ?? 'low', format: { type: 'json_schema', schema: c.schema } },
      },
      { signal: c.signal },
    );
  } catch (e) {
    throw toAiError(e);
  }
  return finish<T>(res, c.model);
}

/** Pulls usage and JSON out of a reply (exported for tests). */
export function finish<T>(res: Anthropic.Message, model: ModelKey): JsonResult<T> {
  const usage: TokenUsage = {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  };
  if (res.stop_reason === 'refusal') throw Object.assign(new AiError('refused'), { usage });
  if (res.stop_reason === 'max_tokens') throw Object.assign(new AiError('cutoff'), { usage });
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    return { data: JSON.parse(text) as T, usage, model };
  } catch {
    throw Object.assign(new AiError('bad'), { usage });
  }
}

/** Checks a key without spending anything (reads the model's info). */
export async function checkKey(apiKey: string): Promise<void> {
  if (!apiKey.trim()) throw new AiError('nokey');
  try {
    await (await client(apiKey.trim())).models.retrieve(MODELS.haiku);
  } catch (e) {
    throw toAiError(e);
  }
}
