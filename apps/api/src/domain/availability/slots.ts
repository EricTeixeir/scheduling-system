import {
  assertValidPolicy,
  checkBookingWindow,
  type BookingPolicy,
} from '../appointment/booking-policy';
import { assertValidInstant, minutesBetween } from '../time/instant';
import {
  assertValidTimeZone,
  localDateOf,
  parseLocalDate,
  type LocalDate,
} from '../time/local-date';
import { fail, ok, type Result } from '../result';
import { overlaps, type TimeRange } from '../time/time-range';
import { businessDayOf, slotsOf, type WeeklyHours } from './weekly-hours';

export interface AvailableSlotsQuery {
  readonly date: LocalDate;
  readonly hours: WeeklyHours | null;
  readonly isClosedDate: boolean;
  readonly busy: readonly TimeRange[];
  readonly now: Date;
  readonly policy: BookingPolicy;
  readonly timeZone: string;
}

export function listAvailableSlots(query: AvailableSlotsQuery): TimeRange[] {
  const { date, hours, isClosedDate, busy, now, policy, timeZone } = query;
  parseLocalDate(date);
  assertValidTimeZone(timeZone);
  assertValidInstant(now, 'now');
  assertValidPolicy(policy);
  if (hours === null || isClosedDate) return [];

  return slotsOf(businessDayOf(date, hours, timeZone)).filter(
    (slot) =>
      !busy.some((taken) => overlaps(slot, taken)) &&
      checkBookingWindow(slot.startsAt, now, policy).ok,
  );
}

export type SlotRefusal = 'CLOSED_DATE' | 'OUTSIDE_BUSINESS_HOURS' | 'MISALIGNED';

export interface SlotRequest {
  readonly startsAt: Date;
  readonly hours: WeeklyHours | null;
  readonly isClosedDate: boolean;
  readonly timeZone: string;
}

// The client only picks the start; the end always comes from the slot grid.
export function resolveRequestedSlot(request: SlotRequest): Result<TimeRange, SlotRefusal> {
  const { startsAt, hours, isClosedDate, timeZone } = request;
  assertValidInstant(startsAt, 'startsAt');
  assertValidTimeZone(timeZone);
  if (hours === null || isClosedDate) return fail('CLOSED_DATE');

  const day = businessDayOf(localDateOf(startsAt, timeZone), hours, timeZone);
  const slot = slotsOf(day).find(
    (candidate) => candidate.startsAt.getTime() === startsAt.getTime(),
  );
  if (slot) return ok(slot);

  const sinceOpening = minutesBetween(day.window.startsAt, startsAt);
  const withinHours = sinceOpening >= 0 && startsAt.getTime() < day.window.endsAt.getTime();
  return withinHours && sinceOpening % day.slotMinutes !== 0
    ? fail('MISALIGNED')
    : fail('OUTSIDE_BUSINESS_HOURS');
}
