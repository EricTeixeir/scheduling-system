// Half-open [startsAt, endsAt), like the database tstzrange: back-to-back ranges do not overlap.
export interface TimeRange {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}
