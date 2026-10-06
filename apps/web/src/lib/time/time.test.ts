import { describe, expect, it } from 'vitest';

import {
  formatDayTitle,
  formatMonthSpan,
  formatTime,
  formatTimeRange,
  hourOf,
  shortWeekdayName,
  weekdayName,
} from './format';
import { addDays, consecutiveDays, dayOfMonth, localDateOf, weekdayOf } from './local-date';

const SAO_PAULO = 'America/Sao_Paulo';

describe('local dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists consecutive days', () => {
    expect(consecutiveDays('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('knows the weekday and the day of the month', () => {
    expect(weekdayOf('2026-10-07')).toBe(3);
    expect(weekdayOf('2026-10-11')).toBe(0);
    expect(dayOfMonth('2026-10-07')).toBe(7);
  });

  it.each(['2026-02-30', '2026-13-01', '07/10/2026', ''])('rejects the invalid date %j', (date) => {
    expect(() => addDays(date, 1)).toThrow(RangeError);
  });

  it('reads the calendar date in the business zone, not in UTC', () => {
    expect(localDateOf('2026-10-08T02:30:00.000Z', SAO_PAULO)).toBe('2026-10-07');
    expect(localDateOf(new Date('2026-10-08T03:00:00.000Z'), SAO_PAULO)).toBe('2026-10-08');
  });
});

describe('formatting', () => {
  it('titles a day like "Quarta, 7 de outubro"', () => {
    expect(formatDayTitle('2026-10-07')).toBe('Quarta, 7 de outubro');
    expect(formatDayTitle('2026-03-01')).toBe('Domingo, 1 de março');
  });

  it('names weekdays in full and short form', () => {
    expect(weekdayName('2026-10-10')).toBe('Sábado');
    expect(shortWeekdayName('2026-10-06')).toBe('Ter');
  });

  it.each([
    ['2026-10-05', '2026-10-11', 'Outubro de 2026'],
    ['2026-10-28', '2026-11-03', 'Outubro – Novembro de 2026'],
    ['2026-12-29', '2027-01-04', 'Dezembro de 2026 – Janeiro de 2027'],
  ])('labels the span %s..%s as %j', (first, last, label) => {
    expect(formatMonthSpan(first, last)).toBe(label);
  });

  it('shows times on a 24-hour clock in the given zone', () => {
    expect(formatTime('2026-10-07T13:00:00.000Z', SAO_PAULO)).toBe('10:00');
    expect(formatTime('2026-10-07T03:05:00.000Z', SAO_PAULO)).toBe('00:05');
    expect(formatTimeRange('2026-10-07T13:00:00.000Z', '2026-10-07T13:30:00.000Z', SAO_PAULO)).toBe(
      '10:00 – 10:30',
    );
  });

  it('reads the local hour of an instant', () => {
    expect(hourOf('2026-10-07T21:00:00.000Z', SAO_PAULO)).toBe(18);
    expect(hourOf('2026-10-07T03:00:00.000Z', SAO_PAULO)).toBe(0);
  });
});
