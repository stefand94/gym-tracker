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
