/** A half-open interval [startsAt, endsAt) of UTC instants, matching the database tstzrange '[)'. */
export interface TimeRange {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** True when the half-open ranges share any instant; back-to-back ranges do not overlap. */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}
