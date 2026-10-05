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

type TimeGuard = (input: GuardInput) => Result<void, TransitionRefusal>;

const clientCancelDeadline: TimeGuard = ({ startsAt, now, policy }) =>
  checkClientCancellation(startsAt, now, policy);

const beforeStart: TimeGuard = ({ startsAt, now }) =>
  now.getTime() < startsAt.getTime() ? ok(undefined) : fail('ALREADY_STARTED');

const atOrAfterStart: TimeGuard = ({ startsAt, now }) =>
  now.getTime() >= startsAt.getTime() ? ok(undefined) : fail('NOT_STARTED_YET');

type TransitionKey = `${AppointmentStatus}->${AppointmentStatus}`;

// ADMIN may cancel only before the start: afterwards the outcome is recorded as
// COMPLETED or NO_SHOW, so history is never rewritten.
// Maps instead of object literals so a lookup can never hit an inherited property.
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

// Ownership (a client acting on someone else's appointment) is checked by the caller.
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
