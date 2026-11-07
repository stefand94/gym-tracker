import type { Workout } from '../types';
import type { QueueOp, SyncSettings } from '../state/store';

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

export async function putWorkout(s: SyncSettings, w: Workout): Promise<void> {
  const path = workoutPath(w);
  const sha = await existingSha(s, path);
  const date = w.startedAt.slice(0, 10);
  await gh(s, `/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Workout ${date}: ${w.name}`,
      content: toBase64(JSON.stringify(w, null, 2) + '\n'),
      branch: s.branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function deleteWorkout(s: SyncSettings, path: string): Promise<void> {
  const sha = await existingSha(s, path);
  if (!sha) return;
  await gh(s, `/contents/${path}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Delete ${path}`, sha, branch: s.branch }),
  });
}

/** Download every workout in the repo whose id isn't in `known`. */
export async function pullWorkouts(s: SyncSettings, known: Set<string>): Promise<Workout[]> {
  let tree: { path: string; type: string }[];
  try {
    const res = await gh(s, `/git/trees/${s.branch}?recursive=1`);
    tree = (await res.json()).tree;
  } catch (e) {
    // Empty repo / branch missing: nothing to pull yet.
    if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return [];
    throw e;
  }
  const missing = tree.filter((t) => t.type === 'blob' && idFromPath(t.path) && !known.has(idFromPath(t.path)!));
  const out: Workout[] = [];
  for (const t of missing) {
    const res = await gh(s, `/contents/${t.path}?ref=${s.branch}`, {}, 'application/vnd.github.raw+json');
    out.push(await res.json());
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

export interface RunResult {
  completed: QueueOp[];
  pulled: Workout[];
  error?: string;
}

export async function runSync(s: SyncSettings, queue: QueueOp[], history: Workout[]): Promise<RunResult> {
  const completed: QueueOp[] = [];
  try {
    for (const op of queue) {
      if (op.op === 'put') {
        const w = history.find((h) => h.id === op.id);
        if (w) await putWorkout(s, w);
      } else {
        await deleteWorkout(s, op.path);
      }
      completed.push(op);
    }
    const known = new Set(history.map((w) => w.id));
    for (const op of queue) if (op.op === 'delete') known.add(op.id);
    const pulled = await pullWorkouts(s, known);
    return { completed, pulled };
  } catch (e) {
    return { completed, pulled: [], error: e instanceof Error ? e.message : String(e) };
  }
}
