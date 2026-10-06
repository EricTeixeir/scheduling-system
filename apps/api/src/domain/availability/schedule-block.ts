import {
  localDateOf,
  parseLocalDate,
  weekdayOf,
  zonedInstant,
  type LocalDate,
} from '../time/local-date';
import { overlaps, type TimeRange } from '../time/time-range';
import { minuteOfDay } from './weekly-hours';

// A recurring unavailable period: on each listed weekday between startsOn and endsOn
// (inclusive; null = no end), from startTime to endTime as LOCAL wall-clock times.
export interface ScheduleBlock {
  readonly weekdays: readonly number[];
  readonly startTime: string;
  readonly endTime: string;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate | null;
}

export function assertValidScheduleBlock(block: ScheduleBlock): void {
  const { weekdays, startTime, endTime, startsOn, endsOn } = block;
  if (
    weekdays.length === 0 ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new RangeError(`weekdays must be integers 0-6, got ${JSON.stringify(weekdays)}`);
  }
  if (minuteOfDay(startTime) >= minuteOfDay(endTime)) {
    throw new RangeError(`startTime (${startTime}) must be before endTime (${endTime})`);
  }
  parseLocalDate(startsOn);
  if (endsOn !== null) {
    parseLocalDate(endsOn);
    if (endsOn < startsOn) {
      throw new RangeError(`endsOn (${endsOn}) must not be before startsOn (${startsOn})`);
    }
  }
}

// 'YYYY-MM-DD' strings compare chronologically as plain text.
export function blockAppliesOn(block: ScheduleBlock, date: LocalDate): boolean {
  assertValidScheduleBlock(block);
  parseLocalDate(date);
  const inRange = date >= block.startsOn && (block.endsOn === null || date <= block.endsOn);
  return inRange && block.weekdays.includes(weekdayOf(date));
}

export function blockOccurrenceOn(
  block: ScheduleBlock,
  date: LocalDate,
  timeZone: string,
): TimeRange | undefined {
  if (!blockAppliesOn(block, date)) return undefined;
  return {
    startsAt: zonedInstant(date, minuteOfDay(block.startTime), timeZone),
    endsAt: zonedInstant(date, minuteOfDay(block.endTime), timeZone),
  };
}

// Checks the local dates of both ends, so a range crossing midnight is not missed.
export function blockOverlaps(block: ScheduleBlock, range: TimeRange, timeZone: string): boolean {
  const lastInstant = new Date(range.endsAt.getTime() - 1);
  const dates = new Set([
    localDateOf(range.startsAt, timeZone),
    localDateOf(lastInstant, timeZone),
  ]);
  return [...dates].some((date) => {
    const occurrence = blockOccurrenceOn(block, date, timeZone);
    return occurrence !== undefined && overlaps(occurrence, range);
  });
}
