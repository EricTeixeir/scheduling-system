import { addMinutes } from '../time/instant';
import { parseLocalDate, weekdayOf, zonedInstant, type LocalDate } from '../time/local-date';
import type { TimeRange } from '../time/time-range';

// Opening and closing are LOCAL wall-clock times ('HH:mm') in the business time zone, not UTC.
export interface WeeklyHours {
  readonly weekday: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly slotMinutes: number;
}

export interface BusinessDay {
  readonly window: TimeRange;
  readonly slotMinutes: number;
}

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minuteOfDay(hhmm: string): number {
  const match = HH_MM_PATTERN.exec(hhmm);
  if (!match) throw new RangeError(`time must be HH:mm (00:00-23:59), got ${JSON.stringify(hhmm)}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function assertValidWeeklyHours(hours: WeeklyHours): void {
  if (!Number.isInteger(hours.weekday) || hours.weekday < 0 || hours.weekday > 6) {
    throw new RangeError(`weekday must be an integer 0-6, got ${String(hours.weekday)}`);
  }
  if (minuteOfDay(hours.opensAt) >= minuteOfDay(hours.closesAt)) {
    throw new RangeError(`opensAt (${hours.opensAt}) must be before closesAt (${hours.closesAt})`);
  }
  if (!Number.isInteger(hours.slotMinutes) || hours.slotMinutes <= 0) {
    throw new RangeError(
      `slotMinutes must be a positive integer, got ${String(hours.slotMinutes)}`,
    );
  }
}

export function businessDayOf(date: LocalDate, hours: WeeklyHours, timeZone: string): BusinessDay {
  parseLocalDate(date);
  assertValidWeeklyHours(hours);
  const weekday = weekdayOf(date);
  if (hours.weekday !== weekday) {
    throw new RangeError(
      `hours are for weekday ${String(hours.weekday)} but ${date} is weekday ${String(weekday)}`,
    );
  }
  return {
    window: {
      startsAt: zonedInstant(date, minuteOfDay(hours.opensAt), timeZone),
      endsAt: zonedInstant(date, minuteOfDay(hours.closesAt), timeZone),
    },
    slotMinutes: hours.slotMinutes,
  };
}

// A trailing partial slot (one that would end after closing) is not offered.
export function slotsOf(day: BusinessDay): TimeRange[] {
  const slots: TimeRange[] = [];
  let startsAt = day.window.startsAt;
  let endsAt = addMinutes(startsAt, day.slotMinutes);
  while (endsAt.getTime() <= day.window.endsAt.getTime()) {
    slots.push({ startsAt, endsAt });
    startsAt = endsAt;
    endsAt = addMinutes(startsAt, day.slotMinutes);
  }
  return slots;
}
