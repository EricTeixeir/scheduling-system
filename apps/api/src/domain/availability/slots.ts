import { MAX_APPOINTMENT_MINUTES } from '@scheduling/shared';

import {
  assertValidPolicy,
  checkBookingWindow,
  type BookingPolicy,
} from '../appointment/booking-policy';
import { addMinutes, assertValidInstant, minutesBetween } from '../time/instant';
import {
  assertValidTimeZone,
  localDateOf,
  parseLocalDate,
  type LocalDate,
} from '../time/local-date';
import { fail, ok, type Result } from '../result';
import { overlaps, type TimeRange } from '../time/time-range';
import { businessDayOf, slotsOf, type BusinessDay, type WeeklyHours } from './weekly-hours';

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

export type SlotRefusal =
  'CLOSED_DATE' | 'OUTSIDE_BUSINESS_HOURS' | 'MISALIGNED' | 'INVALID_DURATION';

export interface SlotRequest {
  readonly startsAt: Date;
  readonly durationMinutes?: number | undefined;
  readonly hours: WeeklyHours | null;
  readonly isClosedDate: boolean;
  readonly timeZone: string;
}

export function resolveRequestedSlot(request: SlotRequest): Result<TimeRange, SlotRefusal> {
  const { startsAt, durationMinutes, hours, isClosedDate, timeZone } = request;
  assertValidInstant(startsAt, 'startsAt');
  assertValidTimeZone(timeZone);
  if (hours === null || isClosedDate) return fail('CLOSED_DATE');

  const day = businessDayOf(localDateOf(startsAt, timeZone), hours, timeZone);
  const slot = slotsOf(day).find(
    (candidate) => candidate.startsAt.getTime() === startsAt.getTime(),
  );
  if (!slot) return refuseUnlistedStart(day, startsAt);
  if (durationMinutes === undefined) return ok(slot);
  if (!isWholeSlotDuration(durationMinutes, day.slotMinutes)) return fail('INVALID_DURATION');

  const endsAt = addMinutes(slot.startsAt, durationMinutes);
  return endsAt.getTime() <= day.window.endsAt.getTime()
    ? ok({ startsAt: slot.startsAt, endsAt })
    : fail('OUTSIDE_BUSINESS_HOURS');
}

function refuseUnlistedStart(day: BusinessDay, startsAt: Date): Result<never, SlotRefusal> {
  const sinceOpening = minutesBetween(day.window.startsAt, startsAt);
  const withinHours = sinceOpening >= 0 && startsAt.getTime() < day.window.endsAt.getTime();
  return withinHours && sinceOpening % day.slotMinutes !== 0
    ? fail('MISALIGNED')
    : fail('OUTSIDE_BUSINESS_HOURS');
}

function isWholeSlotDuration(durationMinutes: number, slotMinutes: number): boolean {
  return (
    Number.isInteger(durationMinutes) &&
    durationMinutes > 0 &&
    durationMinutes <= MAX_APPOINTMENT_MINUTES &&
    durationMinutes % slotMinutes === 0
  );
}
