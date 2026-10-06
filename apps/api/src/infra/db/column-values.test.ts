import { describe, expect, it } from 'vitest';

import {
  dateColumnToLocalDate,
  hhMmToTimeColumn,
  localDateToDateColumn,
  timeColumnToHhMm,
} from './column-values';

describe('TIME column values', () => {
  it.each(['00:00', '09:05', '13:30', '23:59'])('round-trips %s', (hhmm) => {
    expect(timeColumnToHhMm(hhMmToTimeColumn(hhmm))).toBe(hhmm);
  });

  it('writes the wall-clock time as UTC on 1970-01-01', () => {
    expect(hhMmToTimeColumn('13:30').toISOString()).toBe('1970-01-01T13:30:00.000Z');
  });
});

describe('DATE column values', () => {
  it.each(['2026-10-05', '2028-02-29', '2026-12-31'])('round-trips %s', (date) => {
    expect(dateColumnToLocalDate(localDateToDateColumn(date))).toBe(date);
  });

  it('writes the date at 00:00 UTC', () => {
    expect(localDateToDateColumn('2026-10-05').toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});
