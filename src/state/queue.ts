import type { QueueOp, SyncKind } from './types';

/** The sync queue: what still has to be written to the data repo. */

export const CUSTOM_ID = 'custom';
export const VIDEOS_ID = 'videos';

export const kindOf = (op: QueueOp): SyncKind => op.kind ?? 'workout';
export const sameTarget = (a: QueueOp, b: { kind?: SyncKind; id: string }) => kindOf(a) === (b.kind ?? 'workout') && a.id === b.id;

export function sameOp(a: QueueOp, b: QueueOp) {
  return a.op === b.op && sameTarget(a, b) && a.t === b.t;
}

let seq = 0;
export function enqueue(queue: QueueOp[], op: QueueOp): QueueOp[] {
  const stamped = { ...op, t: Date.now() * 1000 + (seq++ % 1000) };
  return [...queue.filter((q) => !sameTarget(q, op)), stamped];
}

export function isPending(queue: QueueOp[], kind: SyncKind, id: string): boolean {
  return queue.some((q) => sameTarget(q, { kind, id }));
}
