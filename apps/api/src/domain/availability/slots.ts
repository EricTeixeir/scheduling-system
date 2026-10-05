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
  /** The calendar day to list, in the business time zone. */
  readonly date: LocalDate;
  /** The rule for that day's weekday, or null when the weekday has no business hours. */
  readonly hours: WeeklyHours | null;
  /** Whether `date` is a closed date (e.g. a holiday). */
  readonly isClosedDate: boolean;
  /** Ranges already taken (appointments that are not CANCELLED). */
  readonly busy: readonly TimeRange[];
  readonly now: Date;
  readonly policy: BookingPolicy;
  /** IANA name of the business time zone. */
  readonly timeZone: string;
}

/**
 * Slots a client may book on `date`, ascending, as UTC instants.
 * A slot is offered when the day is open, it fits before closing time, it
 * overlaps no busy range (half-open, so back-to-back is fine) and it passes
 * checkBookingWindow. A date in the past or beyond the horizon therefore
 * yields an empty list with no special case, and a day straddling the
 * horizon keeps exactly the slots that could be booked.
 * Throws (programmer error) on an invalid date, time zone, now, policy or hours,
 * or hours that belong to another weekday than `date`.
 */
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
  /** The start the client asked for. The duration is never chosen by the client. */
  readonly startsAt: Date;
  /** The rule for the weekday of startsAt's local date, or null when closed that weekday. */
  readonly hours: WeeklyHours | null;
  /** Whether startsAt's local date is a closed date. */
  readonly isClosedDate: boolean;
  readonly timeZone: string;
}

/**
 * Maps a requested start onto the business-day slot grid and returns the
 * server-computed slot (endsAt = startsAt + slotMinutes). Refusals:
 * - CLOSED_DATE: a closed date, or a weekday without business hours;
 * - MISALIGNED: inside business hours but not on a slot boundary (any non-zero
 *   seconds or milliseconds included);
 * - OUTSIDE_BUSINESS_HOURS: before opening, at/after closing, or a boundary
 *   whose slot would end after closing (the trailing partial slot).
 * Past / too soon / too far are checkBookingWindow's job and not checked here.
 * The caller looks up `hours` and `isClosedDate` for localDateOf(startsAt);
 * hours for another weekday throw (programmer error), as do invalid inputs.
 */
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
