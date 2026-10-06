export type LocalDate = string;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toUtcMidnight(date: LocalDate): Date {
  const match = LOCAL_DATE_PATTERN.exec(date);
  const midnight =
    match === null
      ? new Date(Number.NaN)
      : new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(midnight.getTime()) || fromUtcMidnight(midnight) !== date) {
    throw new RangeError(`Invalid local date: ${date}`);
  }
  return midnight;
}

function fromUtcMidnight(instant: Date): LocalDate {
  return instant.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMidnight(new Date(toUtcMidnight(date).getTime() + days * MS_PER_DAY));
}

export function consecutiveDays(start: LocalDate, count: number): LocalDate[] {
  return Array.from({ length: count }, (_, offset) => addDays(start, offset));
}

export function weekdayOf(date: LocalDate): Weekday {
  return toUtcMidnight(date).getUTCDay() as Weekday;
}

export function dayOfMonth(date: LocalDate): number {
  return toUtcMidnight(date).getUTCDate();
}

export function localDateOf(instant: Date | string, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
