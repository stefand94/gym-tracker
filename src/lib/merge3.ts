type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const hasIds = (x: unknown): x is (Obj & { id: string })[] => Array.isArray(x) && x.every((e) => isObj(e) && typeof e.id === 'string');

/** Deep equality for JSON values; key order and keys set to undefined don't matter. */
export function jsonEqual(a: unknown, b: unknown): boolean {
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
