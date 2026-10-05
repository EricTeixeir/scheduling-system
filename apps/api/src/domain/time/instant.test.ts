import { describe, expect, it } from 'vitest';

import { addMinutes, assertValidInstant, minutesBetween } from './instant';

const T = new Date('2026-10-04T12:00:00.000Z');

describe('addMinutes', () => {
  it('shifts forward and backward by elapsed minutes', () => {
    expect(addMinutes(T, 90).toISOString()).toBe('2026-10-04T13:30:00.000Z');
    expect(addMinutes(T, -30).toISOString()).toBe('2026-10-04T11:30:00.000Z');
  });

  it('does not mutate the input', () => {
    addMinutes(T, 10);
    expect(T.toISOString()).toBe('2026-10-04T12:00:00.000Z');
  });
});

describe('minutesBetween', () => {
  it('is signed', () => {
    expect(minutesBetween(T, addMinutes(T, 45))).toBe(45);
    expect(minutesBetween(addMinutes(T, 45), T)).toBe(-45);
  });
});

describe('assertValidInstant', () => {
  it('accepts a valid Date', () => {
    expect(() => {
      assertValidInstant(T, 'now');
    }).not.toThrow();
  });

  it('rejects an invalid Date and a non-Date', () => {
    expect(() => {
      assertValidInstant(new Date('nope'), 'now');
    }).toThrow('now must be a valid Date');
    expect(() => {
      assertValidInstant('2026-10-04' as unknown as Date, 'startsAt');
    }).toThrow('startsAt must be a valid Date');
  });
});
