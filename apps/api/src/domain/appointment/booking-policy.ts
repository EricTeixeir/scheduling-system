import { ok, fail, type Result } from '../result';
import { addMinutes, assertValidInstant } from '../time/instant';

export interface BookingPolicy {
  readonly minLeadMinutes: number;
  readonly cancelDeadlineMinutes: number;
  readonly horizonDays: number;
}

export const DEFAULT_MIN_LEAD_MINUTES = 60;
export const DEFAULT_CANCEL_DEADLINE_MINUTES = 30;
export const DEFAULT_HORIZON_DAYS = 90;

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  minLeadMinutes: DEFAULT_MIN_LEAD_MINUTES,
  cancelDeadlineMinutes: DEFAULT_CANCEL_DEADLINE_MINUTES,
  horizonDays: DEFAULT_HORIZON_DAYS,
};

const MINUTES_PER_DAY = 24 * 60;

export type BookingWindowRefusal = 'IN_PAST' | 'TOO_SOON' | 'TOO_FAR';
export type ClientCancellationRefusal = 'CANCEL_DEADLINE_PASSED';

export function assertValidPolicy(policy: BookingPolicy): void {
  const fields = [
    ['minLeadMinutes', policy.minLeadMinutes, 0],
    ['cancelDeadlineMinutes', policy.cancelDeadlineMinutes, 0],
    ['horizonDays', policy.horizonDays, 1],
  ] as const;
  for (const [name, value, min] of fields) {
    if (!Number.isInteger(value) || value < min) {
      throw new RangeError(
        `policy.${name} must be an integer >= ${String(min)}, got ${String(value)}`,
      );
    }
  }
}

// A slot starting exactly now is already past; exactly at now + minLead or at the horizon is allowed.
export function checkBookingWindow(
  startsAt: Date,
  now: Date,
  policy: BookingPolicy,
): Result<void, BookingWindowRefusal> {
  assertValidInstant(startsAt, 'startsAt');
  assertValidInstant(now, 'now');
  assertValidPolicy(policy);

  const start = startsAt.getTime();
  if (start <= now.getTime()) return fail('IN_PAST');
  if (start < addMinutes(now, policy.minLeadMinutes).getTime()) return fail('TOO_SOON');
  if (start > addMinutes(now, policy.horizonDays * MINUTES_PER_DAY).getTime()) {
    return fail('TOO_FAR');
  }
  return ok(undefined);
}

export function checkClientCancellation(
  startsAt: Date,
  now: Date,
  policy: BookingPolicy,
): Result<void, ClientCancellationRefusal> {
  assertValidInstant(startsAt, 'startsAt');
  assertValidInstant(now, 'now');
  assertValidPolicy(policy);

  const deadline = addMinutes(startsAt, -policy.cancelDeadlineMinutes);
  return now.getTime() > deadline.getTime() ? fail('CANCEL_DEADLINE_PASSED') : ok(undefined);
}
