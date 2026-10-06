import { addDays, consecutiveDays, type LocalDate } from '@/lib/time/local-date';

export const DAYS_PER_WEEK = 7;

export interface DaySelection {
  readonly firstDay: LocalDate;
  readonly selected: LocalDate;
}

export function startSelection(today: LocalDate): DaySelection {
  return { firstDay: today, selected: today };
}

export function visibleDays({ firstDay }: DaySelection): LocalDate[] {
  return consecutiveDays(firstDay, DAYS_PER_WEEK);
}

export function selectDay(selection: DaySelection, date: LocalDate): DaySelection {
  const lastDay = addDays(selection.firstDay, DAYS_PER_WEEK - 1);
  const isVisible = date >= selection.firstDay && date <= lastDay;
  return isVisible ? { ...selection, selected: date } : { firstDay: date, selected: date };
}

export function shiftWeek(selection: DaySelection, weeks: number, today: LocalDate): DaySelection {
  const shifted = addDays(selection.firstDay, weeks * DAYS_PER_WEEK);
  const firstDay = shifted < today ? today : shifted;
  return { firstDay, selected: firstDay };
}

export function canGoToPreviousWeek(selection: DaySelection, today: LocalDate): boolean {
  return selection.firstDay > today;
}
