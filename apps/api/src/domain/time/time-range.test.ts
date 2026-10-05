import { describe, expect, it } from 'vitest';

import { overlaps, type TimeRange } from './time-range';

function range(from: string, to: string): TimeRange {
  return {
    startsAt: new Date(`2026-10-05T${from}:00.000Z`),
    endsAt: new Date(`2026-10-05T${to}:00.000Z`),
  };
}

describe('overlaps (half-open)', () => {
  const slot = range('09:00', '09:30');

  it.each([
    ['identical', range('09:00', '09:30'), true],
    ['partial at the start', range('08:45', '09:15'), true],
    ['partial at the end', range('09:15', '09:45'), true],
    ['enclosing', range('08:00', '10:00'), true],
    ['enclosed', range('09:10', '09:20'), true],
    ['adjacent before', range('08:30', '09:00'), false],
    ['adjacent after', range('09:30', '10:00'), false],
    ['disjoint', range('11:00', '11:30'), false],
  ])('%s -> %s', (_label, other, expected) => {
    expect(overlaps(slot, other)).toBe(expected);
    expect(overlaps(other, slot)).toBe(expected);
  });
});
