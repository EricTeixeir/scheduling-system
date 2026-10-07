import { describe, expect, it } from 'vitest';

import {
  addLocalDays,
  assertValidTimeZone,
  localDateOf,
  localDayRange,
  parseLocalDate,
  weekdayOf,
  zonedInstant,
} from './local-date';

const SAO_PAULO = 'America/Sao_Paulo';

function iso(date: Date): string {
  return date.toISOString();
}

describe('assertValidTimeZone', () => {
  it.each([SAO_PAULO, 'UTC'])('accepts %s', (timeZone) => {
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

describe('addLocalDays', () => {
  it.each([
    ['2026-10-06', 6, '2026-10-12'],
    ['2026-10-06', -29, '2026-09-07'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-03-01', -1, '2028-02-29'],
  ])('moves %s by %i days to %s', (date, days, expected) => {
    expect(addLocalDays(date, days)).toBe(expected);
  });

  it('refuses a date that does not exist', () => {
    expect(() => addLocalDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('zonedInstant', () => {
  it('converts the Sao Paulo wall clock to UTC (UTC-3)', () => {
    expect(iso(zonedInstant('2026-01-15', 9 * 60, SAO_PAULO))).toBe('2026-01-15T12:00:00.000Z');
    expect(iso(zonedInstant('2026-10-05', 9 * 60, SAO_PAULO))).toBe('2026-10-05T12:00:00.000Z');
  });

  it('throws on an invalid date or time zone', () => {
    expect(() => zonedInstant('2026-02-30', 0, SAO_PAULO)).toThrow('YYYY-MM-DD');
    expect(() => zonedInstant('2026-10-05', 0, 'Nope/Zone')).toThrow('unknown time zone');
  });
});

describe('localDayRange', () => {
  it('spans local midnight to the next local midnight', () => {
    const range = localDayRange('2026-10-05', SAO_PAULO);
    expect(iso(range.startsAt)).toBe('2026-10-05T03:00:00.000Z');
    expect(iso(range.endsAt)).toBe('2026-10-06T03:00:00.000Z');
  });

  it('crosses month and year ends', () => {
    expect(iso(localDayRange('2026-12-31', 'UTC').endsAt)).toBe('2027-01-01T00:00:00.000Z');
  });

  it('is 23 hours long on a spring-forward day', () => {
    const range = localDayRange('2026-03-08', 'America/New_York');
    expect((range.endsAt.getTime() - range.startsAt.getTime()) / 3_600_000).toBe(23);
  });

  it('throws on an invalid date', () => {
    expect(() => localDayRange('2026-02-30', SAO_PAULO)).toThrow('YYYY-MM-DD');
  });
});
