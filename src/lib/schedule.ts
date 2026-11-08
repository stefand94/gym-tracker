import type { Routine, Workout } from '../types';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
const DAY_NAMES: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export function dayKey(d: Date): DayKey {
  return DAY_KEYS[d.getDay()];
}

/** "Monday", or "Mon & Thu" for more than one day. */
export function daysLabel(days: readonly DayKey[] | undefined): string {
  if (!days?.length) return '';
  if (days.length === 1) return DAY_NAMES[days[0]];
  return days.map((d) => DAY_NAMES[d].slice(0, 3)).join(' & ');
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The routine scheduled for today, unless it has already been finished today. */
export function todaysRoutine(routines: Routine[], history: Workout[], now = new Date()): Routine | null {
  const today = dayKey(now);
  const r = routines.find((x) => x.days?.includes(today));
  if (!r) return null;
  const doneToday = history.some((w) => w.routineId === r.id && w.finishedAt && sameDay(new Date(w.startedAt), now));
  return doneToday ? null : r;
}
