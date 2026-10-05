import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { assertValidInstant } from './instant';

/** A calendar date in the business time zone, formatted 'YYYY-MM-DD'. */
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
}

/** Throws (programmer error) unless `timeZone` is an IANA name the runtime knows. */
export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch (error) {
    throw new RangeError(`unknown time zone: ${JSON.stringify(timeZone)}`, { cause: error });
  }
}

/** Parses a LocalDate, throwing (programmer error) on bad format or a date that does not exist (e.g. 2026-02-30). */
export function parseLocalDate(date: LocalDate): DateParts {
  const match = LOCAL_DATE_PATTERN.exec(date);
  const parts = match && { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts) {
    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const exists =
      probe.getUTCFullYear() === parts.year &&
      probe.getUTCMonth() === parts.month - 1 &&
      probe.getUTCDate() === parts.day;
    if (exists) return parts;
  }
  throw new RangeError(
    `date must be a real calendar date as YYYY-MM-DD, got ${JSON.stringify(date)}`,
  );
}

/** The calendar date `instant` falls on, as seen on a wall clock in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  assertValidInstant(instant, 'instant');
  assertValidTimeZone(timeZone);
  return format(new TZDate(instant.getTime(), timeZone), 'yyyy-MM-dd');
}

/**
 * Day of the week of a calendar date: 0 = Sunday ... 6 = Saturday (Date#getDay).
 * No time zone needed: a calendar date has the same weekday everywhere.
 */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The UTC instant at which a wall clock in `timeZone` shows `minuteOfDay` on `date`.
 * The offset comes from the IANA time zone database (never hard-coded), so a
 * change in the zone's rules is picked up by updating the runtime's tz data.
 */
export function zonedInstant(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const { year, month, day } = parseLocalDate(date);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone).getTime());
}
