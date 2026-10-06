import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { assertValidInstant } from './instant';
import type { TimeRange } from './time-range';

// 'YYYY-MM-DD' in the business time zone.
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number;
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch (error) {
    throw new RangeError(`unknown time zone: ${JSON.stringify(timeZone)}`, { cause: error });
  }
}

export function parseLocalDate(date: LocalDate): DateParts {
  const match = LOCAL_DATE_PATTERN.exec(date);
  const parts = match && { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts) {
    // Date.UTC silently rolls 2026-02-30 over to March; reading it back rejects such dates.
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

export function localDateOf(instant: Date, timeZone: string): LocalDate {
  assertValidInstant(instant, 'instant');
  assertValidTimeZone(timeZone);
  return format(new TZDate(instant.getTime(), timeZone), 'yyyy-MM-dd');
}

// 0 = Sunday ... 6 = Saturday. No time zone: a calendar date has the same weekday everywhere.
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function zonedInstant(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const { year, month, day } = parseLocalDate(date);
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone).getTime());
}

// The whole local calendar day as instants: [00:00 of date, 00:00 of the next day).
// Not always 24 h long: a DST change makes the day shorter or longer.
export function localDayRange(date: LocalDate, timeZone: string): TimeRange {
  const { year, month, day } = parseLocalDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = next.toISOString().slice(0, 10);
  return { startsAt: zonedInstant(date, 0, timeZone), endsAt: zonedInstant(nextDate, 0, timeZone) };
}
