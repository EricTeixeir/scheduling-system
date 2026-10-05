import { ok, fail, type Result } from '../result';
import { addMinutes, assertValidInstant } from '../time/instant';

/** Time rules for booking and client cancellation. All values are elapsed time, not calendar time. */
export interface BookingPolicy {
  /** A slot must start at least this many minutes after now. */
  readonly minLeadMinutes: number;
  /** A client may cancel up to this many minutes before the start. */
  readonly cancelDeadlineMinutes: number;
  /** A slot may start at most this many days (of 24 h) after now. */
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

/**
 * Throws (programmer error) unless every policy value is a non-negative
 * integer and the horizon is at least one day. Env parsing validates first;
 * this guards the domain against a policy built by hand.
 */
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

/**
 * Whether a slot starting at `startsAt` may be booked at `now`.
 * Boundaries (inclusive means allowed):
 * - IN_PAST:  startsAt <= now (a slot starting exactly now is already past);
 * - TOO_SOON: startsAt <  now + minLead (exactly now + minLead is allowed);
 * - TOO_FAR:  startsAt >  now + horizonDays * 24 h (exactly at the horizon is allowed).
 * Checked in that order, so the most fundamental reason wins.
 * Throws on invalid dates or policy (programmer error).
 */
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

/**
 * Whether a CLIENT may still cancel an appointment starting at `startsAt`.
 * The deadline instant is startsAt - cancelDeadline and is itself allowed:
 * refused only when now > startsAt - cancelDeadline.
 * Throws on invalid dates or policy (programmer error).
 */
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
