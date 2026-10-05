import { describe, expect, it } from 'vitest';

import {
  assertValidTimeZone,
  localDateOf,
  parseLocalDate,
  weekdayOf,
  zonedInstant,
} from './local-date';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';

function iso(date: Date): string {
  return date.toISOString();
}

describe('assertValidTimeZone', () => {
  it.each([SAO_PAULO, NEW_YORK, 'UTC'])('accepts %s', (timeZone) => {
    expect(() => {
      assertValidTimeZone(timeZone);
    }).not.toThrow();
  });

  it.each(['Nope/Zone', ''])('rejects %j', (timeZone) => {
    expect(() => {
      assertValidTimeZone(timeZone);
    }).toThrow('unknown time zone');
  });
});

describe('parseLocalDate', () => {
  it('parses a valid date, including a leap day', () => {
    expect(parseLocalDate('2026-10-05')).toEqual({ year: 2026, month: 10, day: 5 });
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each([
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-10-5',
    '2026/10/05',
    '2026-10-05T00:00',
    '',
  ])('rejects %j', (date) => {
    expect(() => parseLocalDate(date)).toThrow('YYYY-MM-DD');
  });
});

describe('localDateOf', () => {
  it('uses the wall clock of the time zone, not UTC', () => {
    // 01:30 UTC on Oct 6 is still 22:30 on Oct 5 in Sao Paulo (UTC-3).
    const instant = new Date('2026-10-06T01:30:00.000Z');
    expect(localDateOf(instant, SAO_PAULO)).toBe('2026-10-05');
    expect(localDateOf(instant, 'UTC')).toBe('2026-10-06');
  });

  it('handles the fall-back hour that happens twice in New York', () => {
    expect(localDateOf(new Date('2026-11-01T05:30:00.000Z'), NEW_YORK)).toBe('2026-11-01'); // 01:30 EDT
    expect(localDateOf(new Date('2026-11-01T06:30:00.000Z'), NEW_YORK)).toBe('2026-11-01'); // 01:30 EST
  });

  it('throws on an invalid instant or time zone', () => {
    expect(() => localDateOf(new Date('x'), SAO_PAULO)).toThrow('instant must be a valid Date');
    expect(() => localDateOf(new Date(0), 'Nope/Zone')).toThrow('unknown time zone');
  });
});

describe('weekdayOf', () => {
  it.each([
    ['2026-10-04', 0],
    ['2026-10-05', 1],
    ['2027-01-02', 6],
    ['2026-03-08', 0],
  ])('%s -> %i', (date, weekday) => {
    expect(weekdayOf(date)).toBe(weekday);
  });

  it('throws on an invalid date', () => {
    expect(() => weekdayOf('2026-02-30')).toThrow('YYYY-MM-DD');
  });
});

describe('zonedInstant', () => {
  it('Sao Paulo has no DST: always UTC-3', () => {
    expect(iso(zonedInstant('2026-01-15', 9 * 60, SAO_PAULO))).toBe('2026-01-15T12:00:00.000Z');
    expect(iso(zonedInstant('2026-10-05', 9 * 60, SAO_PAULO))).toBe('2026-10-05T12:00:00.000Z');
  });

  it('New York spring-forward (2026-03-08): a nonexistent time moves forward by the gap', () => {
    // 01:30 EST, then 02:00 -> 03:00 EDT, 02:30 -> 03:30 EDT, and 03:00 EDT itself.
    expect(iso(zonedInstant('2026-03-08', 90, NEW_YORK))).toBe('2026-03-08T06:30:00.000Z');
    expect(iso(zonedInstant('2026-03-08', 120, NEW_YORK))).toBe('2026-03-08T07:00:00.000Z');
    expect(iso(zonedInstant('2026-03-08', 150, NEW_YORK))).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(zonedInstant('2026-03-08', 180, NEW_YORK))).toBe('2026-03-08T07:00:00.000Z');
  });

  it('New York fall-back (2026-11-01): an ambiguous time resolves to the earlier occurrence', () => {
    // 01:00 and 01:30 resolve to EDT (first occurrence); 02:00 exists only in EST.
    expect(iso(zonedInstant('2026-11-01', 60, NEW_YORK))).toBe('2026-11-01T05:00:00.000Z');
    expect(iso(zonedInstant('2026-11-01', 90, NEW_YORK))).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(zonedInstant('2026-11-01', 120, NEW_YORK))).toBe('2026-11-01T07:00:00.000Z');
  });

  it('throws on an invalid date or time zone', () => {
    expect(() => zonedInstant('2026-02-30', 0, SAO_PAULO)).toThrow('YYYY-MM-DD');
    expect(() => zonedInstant('2026-10-05', 0, 'Nope/Zone')).toThrow('unknown time zone');
  });
});
