import type { Exercise, Routine, Workout } from '../types';
import type { QueueOp, RemoteData, SyncSettings, VideoPin } from '../state/store';
import { mergeForPush, mergeKeyed } from './merge';
import { merge3 } from './merge3';

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
export const VIDEOS_PATH = 'exercises/videos.json';

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

/** PUT a file; returns the new blob sha. */
async function putJson(s: SyncSettings, path: string, data: unknown, message: string, sha?: string): Promise<string | undefined> {
  const res = await gh(s, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(JSON.stringify(data, null, 2) + '\n'),
      branch: s.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  try {
    return (await res.json()).content?.sha;
  } catch {
    return undefined;
  }
}

const isConflict = (e: unknown) => e instanceof GitHubError && (e.status === 409 || e.status === 422);

/**
 * Push a workout. `lastSha` is the copy we last pulled or pushed: when the file has changed in the repo since (e.g.
 * Claude fixed a label), the push is refused, so we merge — the repo's changes and ours both kept, ours winning
 * where both touched the same field — and push that. Returns the new sha and what was saved.
 */
export async function putWorkout(s: SyncSettings, w: Workout, lastSha?: string): Promise<{ sha?: string; saved: Workout }> {
  const path = workoutPath(w);
  const message = `Workout ${w.startedAt.slice(0, 10)}: ${w.name}`;
  if (!lastSha) return { sha: await putJson(s, path, w, message, await existingSha(s, path)), saved: w };
  try {
    return { sha: await putJson(s, path, w, message, lastSha), saved: w };
  } catch (e) {
    if (!isConflict(e)) throw e;
  }
  let remote: { sha?: string; data?: Workout } = {};
  try {
    const file = await (await gh(s, `/contents/${path}?ref=${s.branch}`)).json();
    remote = { sha: file.sha, data: JSON.parse(fromBase64(file.content)) };
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e;
  }
  if (!remote.data) return { sha: await putJson(s, path, w, message), saved: w }; // gone from the repo: ours again
  const blob = await (await gh(s, `/git/blobs/${lastSha}`)).json();
  const saved = merge3(JSON.parse(fromBase64(blob.content)), w, remote.data);
  return { sha: await putJson(s, path, saved, message, remote.sha), saved };
}

export async function putRoutine(s: SyncSettings, r: Routine): Promise<string | undefined> {
  const path = routinePath(r.id);
  return putJson(s, path, r, `${r.archived ? 'Archive' : 'Save'} routine: ${r.name}`, await existingSha(s, path));
}

/** Fetch–merge–put, so edits made to the file in the repo (e.g. by Claude) are never overwritten. */
async function mergePut<T>(s: SyncSettings, path: string, empty: T, merge: (remote: T) => T, message: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    let remote = empty;
    let sha: string | undefined;
    try {
      const res = await gh(s, `/contents/${path}?ref=${s.branch}`);
      const file = await res.json();
      sha = file.sha;
      remote = JSON.parse(fromBase64(file.content));
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 404)) throw e;
    }
    try {
      await putJson(s, path, merge(remote), message, sha);
      return;
    } catch (e) {
      // Someone else wrote the file between our read and write: read again and retry once.
      if (attempt === 0 && isConflict(e)) continue;
      throw e;
    }
  }
}

export const putCustomExercises = (s: SyncSettings, local: Exercise[]) =>
  mergePut<Exercise[]>(s, CUSTOM_PATH, [], (remote) => mergeForPush(remote, local), 'Save custom exercises');

export const putVideos = (s: SyncSettings, local: Record<string, VideoPin>) =>
  mergePut<Record<string, VideoPin>>(s, VIDEOS_PATH, {}, (remote) => mergeKeyed(remote, local), 'Save pinned videos');

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
 * Download every workout whose id isn't in `known` or whose file changed in the repo since we last pulled it
 * (e.g. Claude fixed a label), plus each routine file and custom.json whose sha differs from the one we last pulled.
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
    if (!id || (known.has(id) && shas[t.path] === t.sha)) continue;
    out.workouts.push(await raw<Workout>(s, t.path));
    out.remote.shas[t.path] = t.sha;
  }
  for (const t of blobs) {
    if (shas[t.path] === t.sha) continue;
    if (routineIdFromPath(t.path)) out.remote.routines.push(await raw<Routine>(s, t.path));
    else if (t.path === CUSTOM_PATH) out.remote.customExercises = await raw<Exercise[]>(s, t.path);
    else if (t.path === VIDEOS_PATH) out.remote.videos = await raw<Record<string, VideoPin>>(s, t.path);
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
  videos?: Record<string, VideoPin>;
}

export interface RunResult {
  completed: QueueOp[];
  /** Workouts to take into history: changed in the repo, or merged with repo changes while pushing. */
  pulled: Workout[];
  remote?: RemoteData;
  error?: string;
}

export async function runSync(s: SyncSettings, input: SyncInput): Promise<RunResult> {
  const { queue, history, routines, customExercises, remoteShas, videos = {} } = input;
  const completed: QueueOp[] = [];
  const merged: Workout[] = [];
  // shas of what we pushed, so the pull below doesn't download our own copies again
  const pushed: Record<string, string> = {};
  const record = (path: string, sha?: string) => sha && (pushed[path] = sha);
  try {
    for (const op of queue) {
      const kind = op.kind ?? 'workout';
      if (op.op === 'delete') await deleteWorkout(s, op.path);
      else if (kind === 'workout') {
        const w = history.find((h) => h.id === op.id);
        if (w) {
          const path = workoutPath(w);
          const { sha, saved } = await putWorkout(s, w, pushed[path] ?? remoteShas[path]);
          record(path, sha);
          if (saved !== w) merged.push(saved);
        }
      } else if (kind === 'routine') {
        const r = routines.find((x) => x.id === op.id);
        if (r) record(routinePath(r.id), await putRoutine(s, r));
      } else if (kind === 'videos') {
        await putVideos(s, videos);
      } else {
        await putCustomExercises(s, customExercises);
      }
      completed.push(op);
    }
    const known = new Set(history.map((w) => w.id));
    for (const op of queue) if (op.op === 'delete') known.add(op.id);
    const { workouts, remote } = await pullAll(s, known, { ...remoteShas, ...pushed });
    const pulled = [...merged.filter((m) => !workouts.some((w) => w.id === m.id)), ...workouts];
    return { completed, pulled, remote: { ...remote, shas: { ...pushed, ...remote.shas } } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { completed, pulled: merged, remote: { routines: [], shas: pushed }, error };
  }
}
