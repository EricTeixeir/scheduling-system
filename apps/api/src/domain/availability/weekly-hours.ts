import { addMinutes } from '../time/instant';
import { parseLocalDate, weekdayOf, zonedInstant, type LocalDate } from '../time/local-date';
import type { TimeRange } from '../time/time-range';

/**
 * Business hours for one weekday, as LOCAL wall-clock times in the business
 * time zone. Mirrors an availability_rules row, whose CHECKs already guarantee
 * what assertValidWeeklyHours checks; the assertion guards hand-built values.
 */
export interface WeeklyHours {
  /** 0 = Sunday ... 6 = Saturday (Date#getDay numbering). */
  readonly weekday: number;
  /** 'HH:mm', 00:00-23:59. */
  readonly opensAt: string;
  /** 'HH:mm', 00:00-23:59, later than opensAt (hours never cross midnight). */
  readonly closesAt: string;
  readonly slotMinutes: number;
}

/** One concrete business day: the opening window as UTC instants plus the slot length. */
export interface BusinessDay {
  readonly window: TimeRange;
  readonly slotMinutes: number;
}

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since local midnight for an 'HH:mm' string; throws (programmer error) on bad format. */
export function minuteOfDay(hhmm: string): number {
  const match = HH_MM_PATTERN.exec(hhmm);
  if (!match) throw new RangeError(`time must be HH:mm (00:00-23:59), got ${JSON.stringify(hhmm)}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Throws (programmer error) unless weekday is 0-6, times are valid 'HH:mm', opensAt < closesAt and slotMinutes is a positive integer. */
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

/**
 * Resolves `hours` on a concrete `date` in `timeZone`, converting opening and
 * closing to UTC instants with zonedInstant. Throws (programmer error) when
 * `hours` is invalid or belongs to another weekday than `date`.
 */
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

/**
 * The slot grid of a business day, ascending. Slots step by slotMinutes from
 * the opening instant, and a slot must end by closing time: a trailing partial
 * slot is not offered.
 */
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
