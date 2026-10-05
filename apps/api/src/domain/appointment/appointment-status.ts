import type { AppointmentStatus, Role } from '@scheduling/shared';

import { checkClientCancellation, type BookingPolicy } from './booking-policy';
import { assertValidInstant } from '../time/instant';
import { fail, ok, type Result } from '../result';

export type TransitionRefusal =
  | 'INVALID_TRANSITION'
  | 'ACTOR_NOT_ALLOWED'
  | 'CANCEL_DEADLINE_PASSED'
  | 'NOT_STARTED_YET'
  | 'ALREADY_STARTED';

interface GuardInput {
  readonly startsAt: Date;
  readonly now: Date;
  readonly policy: BookingPolicy;
}

/** When, relative to the appointment start, an actor may perform a transition. */
type TimeGuard = (input: GuardInput) => Result<void, TransitionRefusal>;

const clientCancelDeadline: TimeGuard = ({ startsAt, now, policy }) =>
  checkClientCancellation(startsAt, now, policy);

const beforeStart: TimeGuard = ({ startsAt, now }) =>
  now.getTime() < startsAt.getTime() ? ok(undefined) : fail('ALREADY_STARTED');

const atOrAfterStart: TimeGuard = ({ startsAt, now }) =>
  now.getTime() >= startsAt.getTime() ? ok(undefined) : fail('NOT_STARTED_YET');

type TransitionKey = `${AppointmentStatus}->${AppointmentStatus}`;

/**
 * Every allowed transition and, per actor, the time guard that applies.
 * A (from, to) pair missing here is invalid; an actor missing from a row is not allowed.
 * - CLIENT cancels up to the cancel deadline (see checkClientCancellation).
 * - ADMIN cancels any time strictly before the start, with no deadline (operational
 *   needs, e.g. the professional is unavailable). Once started, the outcome is
 *   recorded as COMPLETED or NO_SHOW instead, so history is never rewritten.
 * - COMPLETED / NO_SHOW are recorded by ADMIN only, from the start instant on.
 * CANCELLED, COMPLETED and NO_SHOW have no outgoing transitions: they are terminal.
 * Maps (not object literals) so a lookup can never hit an inherited property.
 */
const TRANSITIONS: ReadonlyMap<TransitionKey, ReadonlyMap<Role, TimeGuard>> = new Map([
  [
    'CONFIRMED->CANCELLED',
    new Map([
      ['CLIENT', clientCancelDeadline],
      ['ADMIN', beforeStart],
    ]),
  ],
  ['CONFIRMED->COMPLETED', new Map([['ADMIN', atOrAfterStart]])],
  ['CONFIRMED->NO_SHOW', new Map([['ADMIN', atOrAfterStart]])],
]);

export interface TransitionRequest {
  readonly from: AppointmentStatus;
  readonly to: AppointmentStatus;
  readonly actor: Role;
  readonly startsAt: Date;
  readonly now: Date;
  readonly policy: BookingPolicy;
}

/**
 * Decides whether `actor` may move an appointment from `from` to `to` at `now`.
 * Checks, in order: the transition exists (same -> same never does), the actor
 * is allowed, then the time guard. Ownership (a client acting on someone
 * else's appointment) is the caller's concern, not decided here.
 * Throws on invalid dates or policy (programmer error).
 */
export function decideTransition(request: TransitionRequest): Result<void, TransitionRefusal> {
  const { from, to, actor, startsAt, now } = request;
  assertValidInstant(startsAt, 'startsAt');
  assertValidInstant(now, 'now');

  const actors = TRANSITIONS.get(`${from}->${to}`);
  if (actors === undefined) return fail('INVALID_TRANSITION');

  const guard = actors.get(actor);
  if (guard === undefined) return fail('ACTOR_NOT_ALLOWED');

  return guard(request);
}
