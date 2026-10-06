import { describe, expect, it } from 'vitest';

import { isLocked, lockedUntilAfter, lockMinutesAfter, LOCKOUT_THRESHOLD } from './lockout-policy';

const NOW = new Date('2026-10-05T12:00:00.000Z');

describe('lockMinutesAfter', () => {
  it.each([0, 1, 2, 3, 4])('does not lock after %i failures', (failures) => {
    expect(lockMinutesAfter(failures)).toBe(0);
  });

  it.each([
    [5, 1],
    [6, 5],
    [7, 15],
    [8, 15],
    [50, 15],
  ])('locks for the escalating duration after %i failures: %i min', (failures, minutes) => {
    expect(lockMinutesAfter(failures)).toBe(minutes);
  });

  it('starts locking exactly at the threshold of 5', () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
    expect(lockMinutesAfter(LOCKOUT_THRESHOLD - 1)).toBe(0);
    expect(lockMinutesAfter(LOCKOUT_THRESHOLD)).toBe(1);
  });

  it.each([-1, 1.5, Number.NaN])('rejects %s', (failures) => {
    expect(() => lockMinutesAfter(failures)).toThrow(RangeError);
  });
});

describe('lockedUntilAfter', () => {
  it('returns no lock below the threshold', () => {
    expect(lockedUntilAfter(4, NOW)).toBeUndefined();
  });

  it('adds the lock duration to now', () => {
    expect(lockedUntilAfter(5, NOW)?.toISOString()).toBe('2026-10-05T12:01:00.000Z');
    expect(lockedUntilAfter(6, NOW)?.toISOString()).toBe('2026-10-05T12:05:00.000Z');
    expect(lockedUntilAfter(9, NOW)?.toISOString()).toBe('2026-10-05T12:15:00.000Z');
  });

  it('rejects an invalid now', () => {
    expect(() => lockedUntilAfter(5, new Date('nope'))).toThrow(TypeError);
  });
});

describe('isLocked', () => {
  it('is unlocked without a lock', () => {
    expect(isLocked(null, NOW)).toBe(false);
  });

  it('is locked strictly before lockedUntil and unlocked from it on', () => {
    const until = new Date('2026-10-05T12:01:00.000Z');
    expect(isLocked(until, new Date(until.getTime() - 1))).toBe(true);
    expect(isLocked(until, until)).toBe(false);
    expect(isLocked(until, new Date(until.getTime() + 1))).toBe(false);
  });

  it('rejects an invalid now', () => {
    expect(() => isLocked(null, new Date('nope'))).toThrow(TypeError);
  });
});
