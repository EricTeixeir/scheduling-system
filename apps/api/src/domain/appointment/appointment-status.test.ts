import { APPOINTMENT_STATUSES, ROLES, type AppointmentStatus, type Role } from '@scheduling/shared';
import { describe, expect, it } from 'vitest';

import { decideTransition, type TransitionRefusal } from './appointment-status';
import type { BookingPolicy } from './booking-policy';
import { addMinutes } from '../time/instant';

const POLICY: BookingPolicy = { minLeadMinutes: 60, cancelDeadlineMinutes: 30, horizonDays: 90 };
const STARTS_AT = new Date('2026-10-10T13:00:00.000Z');
const EARLY = addMinutes(STARTS_AT, -2 * 24 * 60); // well before the start and the cancel deadline
const LATE = addMinutes(STARTS_AT, 60); // after the start
const MS = 1 / 60_000;

type Expected = TransitionRefusal | 'OK';
const INVALID = { early: 'INVALID_TRANSITION', late: 'INVALID_TRANSITION' } as const;

// Written by hand, not derived from the implementation table, so it is an independent spec.
const EXPECTED: Record<
  AppointmentStatus,
  Record<AppointmentStatus, Record<Role, { early: Expected; late: Expected }>>
> = {
  CONFIRMED: {
    CONFIRMED: { CLIENT: INVALID, ADMIN: INVALID },
    CANCELLED: {
      CLIENT: { early: 'OK', late: 'CANCEL_DEADLINE_PASSED' },
      ADMIN: { early: 'OK', late: 'ALREADY_STARTED' },
    },
    COMPLETED: {
      CLIENT: { early: 'ACTOR_NOT_ALLOWED', late: 'ACTOR_NOT_ALLOWED' },
      ADMIN: { early: 'NOT_STARTED_YET', late: 'OK' },
    },
    NO_SHOW: {
      CLIENT: { early: 'ACTOR_NOT_ALLOWED', late: 'ACTOR_NOT_ALLOWED' },
      ADMIN: { early: 'NOT_STARTED_YET', late: 'OK' },
    },
  },
  CANCELLED: {
    CONFIRMED: { CLIENT: INVALID, ADMIN: INVALID },
    CANCELLED: { CLIENT: INVALID, ADMIN: INVALID },
    COMPLETED: { CLIENT: INVALID, ADMIN: INVALID },
    NO_SHOW: { CLIENT: INVALID, ADMIN: INVALID },
  },
  COMPLETED: {
    CONFIRMED: { CLIENT: INVALID, ADMIN: INVALID },
    CANCELLED: { CLIENT: INVALID, ADMIN: INVALID },
    COMPLETED: { CLIENT: INVALID, ADMIN: INVALID },
    NO_SHOW: { CLIENT: INVALID, ADMIN: INVALID },
  },
  NO_SHOW: {
    CONFIRMED: { CLIENT: INVALID, ADMIN: INVALID },
    CANCELLED: { CLIENT: INVALID, ADMIN: INVALID },
    COMPLETED: { CLIENT: INVALID, ADMIN: INVALID },
    NO_SHOW: { CLIENT: INVALID, ADMIN: INVALID },
  },
};

function outcome(from: AppointmentStatus, to: AppointmentStatus, actor: Role, now: Date): Expected {
  const result = decideTransition({ from, to, actor, startsAt: STARTS_AT, now, policy: POLICY });
  return result.ok ? 'OK' : result.reason;
}

const CASES = Object.entries(EXPECTED).flatMap(([from, byTarget]) =>
  Object.entries(byTarget).flatMap(([to, byActor]) =>
    Object.entries(byActor).map(
      ([actor, expected]) =>
        [from as AppointmentStatus, to as AppointmentStatus, actor as Role, expected] as const,
    ),
  ),
);

describe('decideTransition: every from x to x actor', () => {
  it('the expectations cover all 32 combinations exactly once', () => {
    const all = APPOINTMENT_STATUSES.flatMap((from) =>
      APPOINTMENT_STATUSES.flatMap((to) => ROLES.map((actor) => `${from}->${to} by ${actor}`)),
    );
    const covered = CASES.map(([from, to, actor]) => `${from}->${to} by ${actor}`);
    expect(all).toHaveLength(32);
    expect(covered.toSorted()).toEqual(all.toSorted());
  });

  it.each(CASES)('%s -> %s by %s', (from, to, actor, expected) => {
    expect(outcome(from, to, actor, EARLY)).toBe(expected.early);
    expect(outcome(from, to, actor, LATE)).toBe(expected.late);
  });
});

describe('decideTransition: time boundaries', () => {
  const deadline = addMinutes(STARTS_AT, -30);

  it.each([
    ['CLIENT cancel exactly at the deadline', 'CANCELLED', 'CLIENT', deadline, 'OK'],
    [
      'CLIENT cancel 1 ms after the deadline',
      'CANCELLED',
      'CLIENT',
      addMinutes(deadline, MS),
      'CANCEL_DEADLINE_PASSED',
    ],
    ['ADMIN cancel after the client deadline', 'CANCELLED', 'ADMIN', addMinutes(deadline, 1), 'OK'],
    ['ADMIN cancel 1 ms before the start', 'CANCELLED', 'ADMIN', addMinutes(STARTS_AT, -MS), 'OK'],
    ['ADMIN cancel exactly at the start', 'CANCELLED', 'ADMIN', STARTS_AT, 'ALREADY_STARTED'],
    [
      'ADMIN complete 1 ms before the start',
      'COMPLETED',
      'ADMIN',
      addMinutes(STARTS_AT, -MS),
      'NOT_STARTED_YET',
    ],
    ['ADMIN complete exactly at the start', 'COMPLETED', 'ADMIN', STARTS_AT, 'OK'],
    [
      'ADMIN no-show 1 ms before the start',
      'NO_SHOW',
      'ADMIN',
      addMinutes(STARTS_AT, -MS),
      'NOT_STARTED_YET',
    ],
    ['ADMIN no-show exactly at the start', 'NO_SHOW', 'ADMIN', STARTS_AT, 'OK'],
  ] as const)('%s', (_label, to, actor, now, expected) => {
    expect(outcome('CONFIRMED', to, actor, now)).toBe(expected);
  });

  it('checks the transition before the actor, and the actor before the time', () => {
    // CLIENT completing a cancelled appointment before the start fails all three; the first wins.
    expect(outcome('CANCELLED', 'COMPLETED', 'CLIENT', EARLY)).toBe('INVALID_TRANSITION');
    // CLIENT completing a confirmed appointment before the start fails actor and time.
    expect(outcome('CONFIRMED', 'COMPLETED', 'CLIENT', EARLY)).toBe('ACTOR_NOT_ALLOWED');
  });

  it('throws on invalid dates (programmer error)', () => {
    const base = { from: 'CONFIRMED', to: 'CANCELLED', actor: 'ADMIN', policy: POLICY } as const;
    expect(() => decideTransition({ ...base, startsAt: new Date('x'), now: EARLY })).toThrow(
      'startsAt',
    );
    expect(() => decideTransition({ ...base, startsAt: STARTS_AT, now: new Date('x') })).toThrow(
      'now',
    );
  });
});
