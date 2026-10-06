import { nameOfWeekday } from '@/lib/time/format';
import type { Weekday } from '@/lib/time/local-date';

export const ALL_WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];
export const WORKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5];

export function weekdaysIn(days: readonly number[]): readonly Weekday[] {
  return ALL_WEEKDAYS.filter((weekday) => days.includes(weekday));
}

export function weekdayInitial(weekday: Weekday): string {
  return nameOfWeekday(weekday).charAt(0);
}

export function weekdayShortName(weekday: Weekday): string {
  return nameOfWeekday(weekday).slice(0, 3);
}
