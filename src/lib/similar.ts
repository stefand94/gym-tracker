import type { Exercise } from '../types';
import type { MuscleId } from '../data/muscles';

function weights(ex: Exercise): Map<MuscleId, number> {
  const m = new Map<MuscleId, number>();
  for (const s of ex.secondary) m.set(s, 0.5);
  for (const p of ex.primary) m.set(p, 1);
  return m;
}

/** 0–1: how much two exercises train the same muscles (weighted overlap; primary counts 1, secondary ½). */
export function similarity(a: Exercise, b: Exercise): number {
  const wa = weights(a);
  const wb = weights(b);
  let both = 0;
  let either = 0;
  for (const m of new Set([...wa.keys(), ...wb.keys()])) {
    const x = wa.get(m) ?? 0;
    const y = wb.get(m) ?? 0;
    both += Math.min(x, y);
    either += Math.max(x, y);
  }
  return either ? both / either : 0;
}

/** True when `b` has one of `a`'s main muscles as its own main muscle. */
export function sharesPrimary(a: Exercise, b: Exercise): boolean {
  return b.primary.some((m) => a.primary.includes(m));
}

/**
 * Replacement candidates for `target`, closest first: exercises with the same main muscles, then the rest,
 * each group ordered by muscle overlap and then name. `target` itself is left out.
 */
export function rankReplacements(target: Exercise, pool: Exercise[]): { close: Exercise[]; other: Exercise[] } {
  const scored = pool
    .filter((e) => e.id !== target.id)
    .map((e) => ({ e, s: similarity(target, e) }))
    .sort((x, y) => y.s - x.s || x.e.name.localeCompare(y.e.name));
  const close: Exercise[] = [];
  const other: Exercise[] = [];
  for (const { e } of scored) (sharesPrimary(target, e) ? close : other).push(e);
  return { close, other };
}
