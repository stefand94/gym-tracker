import type { Exercise, SetEntry, Workout } from '../types';

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function daysAgo(iso: string, now = new Date()): number {
  const a = new Date(iso);
  const d0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const d1 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d1 - d0) / 86400000);
}

export function relDay(iso: string): string {
  const d = daysAgo(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

export function duration(w: Workout): string {
  if (!w.finishedAt) return '';
  const mins = Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

export function fmtNum(n: number | undefined): string {
  if (n === undefined) return '–';
  return String(Math.round(n * 100) / 100);
}

export function fmtSet(ex: Exercise | undefined, s: SetEntry): string {
  if (ex?.type === 'timed') return `${fmtNum(s.seconds)}s${s.weight ? ` +${fmtNum(s.weight)}kg` : ''}`;
  if (ex?.type === 'bodyweight') return `${fmtNum(s.reps)}${s.weight ? ` +${fmtNum(s.weight)}kg` : ' reps'}`;
  return `${fmtNum(s.weight)}kg × ${fmtNum(s.reps)}`;
}

export function weightStep(ex: Exercise): number {
  if (ex.type === 'machine') return 5;
  if (/dumbbell|kettlebell/i.test(ex.equipment)) return 1;
  if (/cable/i.test(ex.equipment)) return 2.5;
  return 2.5;
}

export function doneSetCount(w: Workout): number {
  let n = 0;
  for (const b of w.blocks) for (const i of b.items) if (i.status !== 'skipped') n += i.sets.filter((s) => s.done).length;
  return n;
}

export function exerciseCount(w: Workout): number {
  let n = 0;
  for (const b of w.blocks) for (const i of b.items) if (i.status !== 'skipped' && i.sets.some((s) => s.done)) n++;
  return n;
}
