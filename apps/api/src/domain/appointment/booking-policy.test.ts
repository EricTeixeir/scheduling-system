import { describe, expect, it } from 'vitest';

import {
  assertValidPolicy,
  checkBookingWindow,
  checkClientCancellation,
  DEFAULT_BOOKING_POLICY,
  type BookingPolicy,
} from './booking-policy';
import { addMinutes } from '../time/instant';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const POLICY: BookingPolicy = { minLeadMinutes: 60, cancelDeadlineMinutes: 30, horizonDays: 90 };
const HORIZON_MINUTES = 90 * 24 * 60;
const MS = 1 / 60_000;

describe('DEFAULT_BOOKING_POLICY', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_BOOKING_POLICY).toEqual({
      minLeadMinutes: 60,
      cancelDeadlineMinutes: 30,
      horizonDays: 90,
    });
  });
});

describe('checkBookingWindow', () => {
  it.each([
    ['one hour ago', -60, 'IN_PAST'],
    ['one ms ago', -MS, 'IN_PAST'],
    ['exactly now', 0, 'IN_PAST'],
    ['one ms after now', MS, 'TOO_SOON'],
    ['one ms before the min lead', 60 - MS, 'TOO_SOON'],
    ['exactly at the min lead', 60, null],
    ['tomorrow', 24 * 60, null],
    ['exactly at the horizon', HORIZON_MINUTES, null],
    ['one ms after the horizon', HORIZON_MINUTES + MS, 'TOO_FAR'],
    ['a year ahead', 365 * 24 * 60, 'TOO_FAR'],
  ] as const)('%s -> %s', (_label, offsetMinutes, expected) => {
    const result = checkBookingWindow(addMinutes(NOW, offsetMinutes), NOW, POLICY);
    expect(result).toEqual(
      expected === null ? { ok: true, value: undefined } : { ok: false, reason: expected },
    );
  });

  it('with a zero min lead, only the past is refused', () => {
    const policy = { ...POLICY, minLeadMinutes: 0 };
    expect(checkBookingWindow(NOW, NOW, policy)).toEqual({ ok: false, reason: 'IN_PAST' });
    expect(checkBookingWindow(addMinutes(NOW, MS), NOW, policy).ok).toBe(true);
  });

  it('throws on invalid dates (programmer error)', () => {
    expect(() => checkBookingWindow(new Date('x'), NOW, POLICY)).toThrow(
      'startsAt must be a valid Date',
    );
    expect(() => checkBookingWindow(NOW, new Date('x'), POLICY)).toThrow(
      'now must be a valid Date',
    );
  });
});

describe('checkClientCancellation', () => {
  const STARTS_AT = new Date('2026-10-05T12:00:00.000Z');

  it.each([
    ['a day before', -24 * 60, null],
    ['exactly at the deadline (start - 30 min)', -30, null],
    ['one ms after the deadline', -30 + MS, 'CANCEL_DEADLINE_PASSED'],
    ['at the start', 0, 'CANCEL_DEADLINE_PASSED'],
    ['after the start', 10, 'CANCEL_DEADLINE_PASSED'],
  ] as const)('%s -> %s', (_label, offsetFromStart, expected) => {
    const result = checkClientCancellation(
      STARTS_AT,
      addMinutes(STARTS_AT, offsetFromStart),
      POLICY,
    );
    expect(result).toEqual(
      expected === null ? { ok: true, value: undefined } : { ok: false, reason: expected },
    );
  });

  it('with a zero deadline, cancelling exactly at the start is allowed', () => {
    const policy = { ...POLICY, cancelDeadlineMinutes: 0 };
    expect(checkClientCancellation(STARTS_AT, STARTS_AT, policy).ok).toBe(true);
    expect(checkClientCancellation(STARTS_AT, addMinutes(STARTS_AT, MS), policy).ok).toBe(false);
  });

  it('throws on invalid dates (programmer error)', () => {
    expect(() => checkClientCancellation(new Date('x'), NOW, POLICY)).toThrow('startsAt');
    expect(() => checkClientCancellation(NOW, new Date('x'), POLICY)).toThrow('now');
  });
});

describe('assertValidPolicy', () => {
  it('accepts the defaults and zero lead/deadline', () => {
    expect(() => {
      assertValidPolicy(DEFAULT_BOOKING_POLICY);
    }).not.toThrow();
    expect(() => {
      assertValidPolicy({ minLeadMinutes: 0, cancelDeadlineMinutes: 0, horizonDays: 1 });
    }).not.toThrow();
  });

  it.each([
    [{ ...POLICY, minLeadMinutes: -1 }, 'policy.minLeadMinutes'],
    [{ ...POLICY, minLeadMinutes: 1.5 }, 'policy.minLeadMinutes'],
    [{ ...POLICY, cancelDeadlineMinutes: Number.NaN }, 'policy.cancelDeadlineMinutes'],
    [{ ...POLICY, horizonDays: 0 }, 'policy.horizonDays'],
  ])('rejects %j', (policy, message) => {
    expect(() => {
      assertValidPolicy(policy);
    }).toThrow(message);
    expect(() => checkBookingWindow(NOW, NOW, policy)).toThrow(message);
  });
});
