const MS_PER_MINUTE = 60_000;

/**
 * Returns `instant` shifted by `minutes` of elapsed time. Plain millisecond
 * arithmetic on purpose: calendar helpers depend on the process time zone.
 */
export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

/** Elapsed minutes from `from` to `to` (negative when `to` is earlier). */
export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_MINUTE;
}

/** Throws (programmer error) unless `value` is a valid Date. */
export function assertValidInstant(value: Date, name: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${name} must be a valid Date`);
  }
}
