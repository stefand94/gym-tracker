import type { Exercise, Routine, Workout } from '../types';
import type { QueueOp, RemoteData, SyncSettings } from '../state/store';
import { mergeForPush } from './merge';

const API = 'https://api.github.com';

export function workoutPath(w: Pick<Workout, 'id' | 'startedAt'>): string {
  const d = new Date(w.startedAt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `workouts/${y}/${y}-${m}-${day}-${w.id}.json`;
}

/** Workout id from a path like workouts/2026/2026-11-07-abc123.json */
export function idFromPath(path: string): string | null {
  const m = /^workouts\/\d{4}\/\d{4}-\d{2}-\d{2}-(.+)\.json$/.exec(path);
  return m ? m[1] : null;
}

export const routinePath = (id: string) => `routines/${id}.json`;
export const CUSTOM_PATH = 'exercises/custom.json';

/** Routine id from routines/<id>.json */
export function routineIdFromPath(path: string): string | null {
  const m = /^routines\/([^/]+)\.json$/.exec(path);
  return m ? m[1] : null;
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gh(s: SyncSettings, path: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  const res = await fetch(`${API}/repos/${s.owner}/${s.repo}${path}`, {
    ...init,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${s.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).message ?? msg;
    } catch {
      /* ignore */
    }
    throw new GitHubError(res.status, `${res.status}: ${msg}`);
  }
  return res;
}

async function existingSha(s: SyncSettings, path: string): Promise<string | undefined> {
  try {
    const res = await gh(s, `/contents/${path}?ref=${s.branch}`);
    return (await res.json()).sha;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return undefined;
    throw e;
  }
}

async function putJson(s: SyncSettings, path: string, data: unknown, message: string, sha?: string): Promise<void> {
  await gh(s, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: s.branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function putWorkout(s: SyncSettings, w: Workout): Promise<void> {
  const path = workoutPath(w);
  await putJson(s, path, w, `Workout ${w.startedAt.slice(0, 10)}: ${w.name}`, await existingSha(s, path));
}

export async function putRoutine(s: SyncSettings, r: Routine): Promise<void> {
  const path = routinePath(r.id);
  await putJson(s, path, r, `${r.archived ? 'Archive' : 'Save'} routine: ${r.name}`, await existingSha(s, path));
}

/** Fetch–merge–put, so edits Claude made to custom.json in the repo are never overwritten. */
export async function putCustomExercises(s: SyncSettings, local: Exercise[]): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    let remote: Exercise[] = [];
    let sha: string | undefined;
    try {
      const res = await gh(s, `/contents/${CUSTOM_PATH}?ref=${s.branch}`);
      const file = await res.json();
      sha = file.sha;
      remote = JSON.parse(fromBase64(file.content));
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 404)) throw e;
    }
    try {
      await putJson(s, CUSTOM_PATH, mergeForPush(remote, local), 'Save custom exercises', sha);
      return;
    } catch (e) {
      // Someone else wrote the file between our read and write: read again and retry once.
      if (attempt === 0 && e instanceof GitHubError && (e.status === 409 || e.status === 422)) continue;
      throw e;
    }
  }
}

export async function deleteWorkout(s: SyncSettings, path: string): Promise<void> {
  const sha = await existingSha(s, path);
  if (!sha) return;
  await gh(s, `/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Delete ${path}`, sha, branch: s.branch }),
  });
}

async function raw<T>(s: SyncSettings, path: string): Promise<T> {
  const res = await gh(s, `/contents/${path}?ref=${s.branch}`, {}, 'application/vnd.github.raw+json');
  return res.json();
}

export interface PullResult {
  workouts: Workout[];
  remote: RemoteData;
}

/**
 * Download every workout whose id isn't in `known`, plus each routine file and custom.json
 * whose sha differs from the one we last pulled.
 */
export async function pullAll(s: SyncSettings, known: Set<string>, shas: Record<string, string>): Promise<PullResult> {
  const empty: PullResult = { workouts: [], remote: { routines: [], shas: {} } };
  let tree: { path: string; type: string; sha: string }[];
  try {
    const res = await gh(s, `/git/trees/${s.branch}?recursive=1`);
    tree = (await res.json()).tree;
  } catch (e) {
    // Empty repo / branch missing: nothing to pull yet.
    if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return empty;
    throw e;
  }
  const blobs = tree.filter((t) => t.type === 'blob');
  const out = empty;
  for (const t of blobs) {
    const id = idFromPath(t.path);
    if (id && !known.has(id)) out.workouts.push(await raw<Workout>(s, t.path));
  }
  for (const t of blobs) {
    if (shas[t.path] === t.sha) continue;
    if (routineIdFromPath(t.path)) out.remote.routines.push(await raw<Routine>(s, t.path));
    else if (t.path === CUSTOM_PATH) out.remote.customExercises = await raw<Exercise[]>(s, t.path);
    else continue;
    out.remote.shas[t.path] = t.sha;
  }
  return out;
}

export async function testConnection(s: SyncSettings): Promise<string> {
  const res = await fetch(`${API}/repos/${s.owner}/${s.repo}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${s.token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Repo not found or token has no access to it' : `${res.status}`);
  const repo = await res.json();
  if (repo.permissions && !repo.permissions.push) throw new Error('Token can read but not write — give it Contents: Read and write');
  return repo.full_name;
}

export interface SyncInput {
  queue: QueueOp[];
  history: Workout[];
  routines: Routine[];
  customExercises: Exercise[];
  remoteShas: Record<string, string>;
}

export interface RunResult {
  completed: QueueOp[];
  pulled: Workout[];
  remote?: RemoteData;
  error?: string;
}

export async function runSync(s: SyncSettings, input: SyncInput): Promise<RunResult> {
  const { queue, history, routines, customExercises, remoteShas } = input;
  const completed: QueueOp[] = [];
  try {
    for (const op of queue) {
      const kind = op.kind ?? 'workout';
      if (op.op === 'delete') await deleteWorkout(s, op.path);
      else if (kind === 'workout') {
        const w = history.find((h) => h.id === op.id);
        if (w) await putWorkout(s, w);
      } else if (kind === 'routine') {
        const r = routines.find((x) => x.id === op.id);
        if (r) await putRoutine(s, r);
      } else {
        await putCustomExercises(s, customExercises);
      }
      completed.push(op);
    }
    const known = new Set(history.map((w) => w.id));
    for (const op of queue) if (op.op === 'delete') known.add(op.id);
    const { workouts, remote } = await pullAll(s, known, remoteShas);
    return { completed, pulled: workouts, remote };
  } catch (e) {
    return { completed, pulled: [], error: e instanceof Error ? e.message : String(e) };
  }
}
