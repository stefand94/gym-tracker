import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workout } from '../types';
import { merge3 } from './merge3';
import { runSync, workoutPath } from './sync';

describe('merge3', () => {
  it('keeps changes from both sides, ours winning where both changed the same field', () => {
    const base = { a: 1, b: 1, c: 1, list: [1, 2] };
    expect(merge3(base, { a: 2, b: 1, c: 3, list: [1, 2, 3] }, { a: 1, b: 2, c: 4, list: [1, 2, 4] })).toEqual({
      a: 2,
      b: 2,
      c: 3,
      list: [1, 2, 3, 4],
    });
  });

  it('merges id lists by id: their additions and removals survive our edits', () => {
    const base = [
      { id: 'x', v: 1 },
      { id: 'y', v: 1 },
    ];
    const ours = [
      { id: 'y', v: 2 },
      { id: 'x', v: 1 },
      { id: 'n', v: 1 },
    ];
    const theirs = [
      { id: 'y', v: 1 },
      { id: 't', v: 1 },
    ]; // removed x, added t
    expect(merge3(base, ours, theirs)).toEqual([
      { id: 'y', v: 2 },
      { id: 'n', v: 1 },
      { id: 't', v: 1 },
    ]);
  });
});

/** A tiny in-memory GitHub contents API. */
function fakeRepo() {
  const files = new Map<string, { sha: string; text: string }>();
  const blobs = new Map<string, string>();
  let n = 0;
  const write = (path: string, data: unknown) => {
    const sha = `sha${++n}`;
    const text = JSON.stringify(data);
    files.set(path, { sha, text });
    blobs.set(sha, text);
    return sha;
  };
  const b64 = (t: string) => btoa(unescape(encodeURIComponent(t)));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = vi.fn(async (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/o\/r/, ''));
    if (path.startsWith('/git/trees/')) return json({ tree: [...files].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha })) });
    if (path.startsWith('/git/blobs/')) return json({ content: b64(blobs.get(path.slice(11))!) });
    const file = path.replace('/contents/', '');
    const f = files.get(file);
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body as string);
      if (f && body.sha !== f.sha) return json({ message: 'sha mismatch' }, body.sha ? 409 : 422);
      const text = decodeURIComponent(escape(atob(body.content)));
      return json({ content: { sha: write(file, JSON.parse(text)) } }, 201);
    }
    if (!f) return json({ message: 'Not Found' }, 404);
    if (init.headers?.Accept?.includes('raw')) return new Response(f.text);
    return json({ sha: f.sha, content: b64(f.text) });
  });
  return { files, write, fetch, read: (p: string) => JSON.parse(files.get(p)!.text) };
}

describe('pushing a workout', () => {
  const s = { token: 't', owner: 'o', repo: 'r', branch: 'main' };
  const base: Workout = {
    id: 'w1',
    name: 'Push',
    startedAt: '2026-11-10T09:00:00.000Z',
    blocks: [{ id: 'b', superset: false, items: [{ id: 'i', exerciseId: 'lateral-raise', status: 'done', sets: [] }] }],
  };
  const path = workoutPath(base);
  let repo: ReturnType<typeof fakeRepo>;
  beforeEach(() => {
    repo = fakeRepo();
    vi.stubGlobal('fetch', repo.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());
  const input = (w: Workout, remoteShas: Record<string, string>) => ({
    queue: [{ op: 'put' as const, kind: 'workout' as const, id: w.id, t: 1 }],
    history: [w],
    routines: [],
    customExercises: [],
    remoteShas,
  });

  it('keeps a fix made in the repo since our last pull, and our own edit', async () => {
    const pulledSha = repo.write(path, base);
    repo.write(path, { ...base, name: 'Push (fixed)' }); // Claude's fix, not pulled yet
    const ours = { ...base, note: 'felt strong' };
    const res = await runSync(s, input(ours, { [path]: pulledSha }));
    expect(res.error).toBeUndefined();
    expect(repo.read(path)).toMatchObject({ name: 'Push (fixed)', note: 'felt strong' });
    expect(res.pulled).toEqual([repo.read(path)]);
    expect(res.remote?.shas[path]).toBe(repo.files.get(path)!.sha);
  });

  it('pushes straight over its own last copy, and does not download it again', async () => {
    const pulledSha = repo.write(path, base);
    const ours = { ...base, note: 'felt strong' };
    const res = await runSync(s, input(ours, { [path]: pulledSha }));
    expect(repo.read(path)).toEqual(ours);
    expect(res.pulled).toEqual([]);
    expect(res.remote?.shas[path]).toBe(repo.files.get(path)!.sha);
  });
});
