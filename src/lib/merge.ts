interface Versioned {
  id: string;
  updatedAt?: string;
}

const newer = (a?: string, b?: string) => (a ?? '') > (b ?? '');

/**
 * Merge `incoming` over `base` by id. An incoming copy replaces the base copy unless the base
 * one is `protect`ed (a local change still waiting to sync) and at least as new.
 */
export function mergeVersioned<T extends Versioned>(base: T[], incoming: T[], protect: (id: string) => boolean = () => false): T[] {
  const byId = new Map(base.map((x) => [x.id, x]));
  for (const r of incoming) {
    const l = byId.get(r.id);
    if (!l || !protect(r.id) || newer(r.updatedAt, l.updatedAt)) byId.set(r.id, r);
  }
  return [...byId.values()];
}

/** What to write to exercises/custom.json: the remote list with newer local entries laid over it. */
export function mergeForPush<T extends Versioned>(remote: T[], local: T[]): T[] {
  const byId = new Map(remote.map((x) => [x.id, x]));
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || newer(l.updatedAt, r.updatedAt)) byId.set(l.id, l);
  }
  return [...byId.values()];
}

export interface Stamped {
  updatedAt: string;
}

/** Merge two keyed maps entry by entry, the newer `updatedAt` winning (e.g. pinned videos). */
export function mergeKeyed<T extends Stamped>(base: Record<string, T>, incoming: Record<string, T>): Record<string, T> {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming)) if (!out[k] || newer(v.updatedAt, out[k].updatedAt)) out[k] = v;
  return out;
}

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const hasIds = (x: unknown): x is (Obj & { id: string })[] => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.id === 'string');

/** Deep equality for JSON values; key order and keys set to undefined don't matter. */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  if (!isObj(a) || !isObj(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => jsonEqual(a[k], b[k]));
}

/**
 * Three-way merge of JSON values: what either side changed since `base` is kept, and where both changed the same
 * thing `ours` wins. Arrays of objects with an `id` (blocks, items) merge by id in our order; arrays both sides only
 * appended to (note threads) keep both tails; other arrays merge element by element when no length changed.
 */
export function merge3<T>(base: unknown, ours: T, theirs: unknown): T {
  if (jsonEqual(ours, base)) return theirs as T;
  if (jsonEqual(theirs, base) || jsonEqual(ours, theirs)) return ours;
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out: Obj = {};
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      const v = merge3(b[k], ours[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out as T;
  }
  if (hasIds(ours) && hasIds(theirs)) {
    const b = new Map((hasIds(base) ? base : []).map((x) => [x.id, x]));
    const t = new Map(theirs.map((x) => [x.id, x]));
    const o = new Set(ours.map((x) => x.id));
    const out: unknown[] = [];
    for (const x of ours) {
      if (t.has(x.id)) out.push(merge3(b.get(x.id), x, t.get(x.id)));
      else if (!b.has(x.id) || !jsonEqual(x, b.get(x.id))) out.push(x); // ours is new, or they removed one we changed
    }
    for (const x of theirs) if (!o.has(x.id) && !b.has(x.id)) out.push(x); // they added it
    return out as T;
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && Array.isArray(base)) {
    const prefix = (a: unknown[]) => a.length >= base.length && base.every((x, i) => jsonEqual(x, a[i]));
    if (prefix(ours) && prefix(theirs)) {
      const mine = ours.slice(base.length);
      return [...base, ...mine, ...theirs.slice(base.length).filter((x) => !mine.some((m) => jsonEqual(m, x)))] as T;
    }
    if (ours.length === base.length && theirs.length === base.length) return ours.map((x, i) => merge3(base[i], x, theirs[i])) as T;
  }
  return ours;
}
