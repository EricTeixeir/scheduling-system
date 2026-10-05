import { describe, expect, it } from 'vitest';

import {
  assertValidWeeklyHours,
  businessDayOf,
  minuteOfDay,
  slotsOf,
  type WeeklyHours,
} from './weekly-hours';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';
const MONDAY: WeeklyHours = { weekday: 1, opensAt: '09:00', closesAt: '12:00', slotMinutes: 30 };

function sunday(opensAt: string, closesAt: string): WeeklyHours {
  return { weekday: 0, opensAt, closesAt, slotMinutes: 30 };
}

function starts(hours: WeeklyHours, date: string, timeZone: string): string[] {
  return slotsOf(businessDayOf(date, hours, timeZone)).map((slot) => slot.startsAt.toISOString());
}

describe('minuteOfDay', () => {
  it.each([
    ['00:00', 0],
    ['09:30', 570],
    ['23:59', 1439],
  ])('%s -> %i', (hhmm, minutes) => {
    expect(minuteOfDay(hhmm)).toBe(minutes);
  });

  it.each(['24:00', '9:00', '09:60', '09:00:00', 'ab:cd', ''])('rejects %j', (hhmm) => {
    expect(() => minuteOfDay(hhmm)).toThrow('HH:mm');
  });
});

describe('assertValidWeeklyHours', () => {
  it('accepts a valid rule', () => {
    expect(() => {
      assertValidWeeklyHours(MONDAY);
    }).not.toThrow();
  });

  it.each([
    [{ ...MONDAY, weekday: 7 }, 'weekday'],
    [{ ...MONDAY, weekday: -1 }, 'weekday'],
    [{ ...MONDAY, weekday: 1.5 }, 'weekday'],
    [{ ...MONDAY, opensAt: '12:00', closesAt: '12:00' }, 'must be before'],
    [{ ...MONDAY, opensAt: '13:00' }, 'must be before'],
    [{ ...MONDAY, closesAt: '25:00' }, 'HH:mm'],
    [{ ...MONDAY, slotMinutes: 0 }, 'slotMinutes'],
    [{ ...MONDAY, slotMinutes: -30 }, 'slotMinutes'],
    [{ ...MONDAY, slotMinutes: 12.5 }, 'slotMinutes'],
  ])('rejects %j', (hours, message) => {
    expect(() => {
      assertValidWeeklyHours(hours);
    }).toThrow(message);
  });
});

describe('businessDayOf', () => {
  it('converts local business hours to UTC instants', () => {
    expect(businessDayOf('2026-10-05', MONDAY, SAO_PAULO)).toEqual({
      window: {
        startsAt: new Date('2026-10-05T12:00:00.000Z'),
        endsAt: new Date('2026-10-05T15:00:00.000Z'),
      },
      slotMinutes: 30,
    });
  });

  it('throws when the hours belong to another weekday (programmer error)', () => {
    expect(() => businessDayOf('2026-10-06', MONDAY, SAO_PAULO)).toThrow(
      'hours are for weekday 1 but 2026-10-06 is weekday 2',
    );
  });

  it('throws on invalid hours or date', () => {
    expect(() => businessDayOf('2026-10-05', { ...MONDAY, slotMinutes: 0 }, SAO_PAULO)).toThrow(
      'slotMinutes',
    );
    expect(() => businessDayOf('05/10/2026', MONDAY, SAO_PAULO)).toThrow('YYYY-MM-DD');
  });
});

describe('slotsOf', () => {
  it('steps by slotMinutes from opening to closing (Sao Paulo, UTC-3)', () => {
    expect(starts(MONDAY, '2026-10-05', SAO_PAULO)).toEqual([
      '2026-10-05T12:00:00.000Z',
      '2026-10-05T12:30:00.000Z',
      '2026-10-05T13:00:00.000Z',
      '2026-10-05T13:30:00.000Z',
      '2026-10-05T14:00:00.000Z',
      '2026-10-05T14:30:00.000Z',
    ]);
  });

  it('every slot lasts exactly slotMinutes', () => {
    const slots = slotsOf(businessDayOf('2026-10-05', { ...MONDAY, slotMinutes: 45 }, SAO_PAULO));
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(45 * 60_000);
    }
  });

  it('does not offer a trailing partial slot', () => {
    // 09:00, 09:30, 10:00; 10:30-11:00 would end after 10:45.
    expect(starts({ ...MONDAY, closesAt: '10:45' }, '2026-10-05', SAO_PAULO)).toEqual([
      '2026-10-05T12:00:00.000Z',
      '2026-10-05T12:30:00.000Z',
      '2026-10-05T13:00:00.000Z',
    ]);
  });

  it('a slot longer than the window yields no slots', () => {
    expect(starts({ ...MONDAY, closesAt: '09:20' }, '2026-10-05', SAO_PAULO)).toEqual([]);
  });

  describe('DST in New York: slots step in elapsed time', () => {
    it('spring-forward 2026-03-08, 00:00-04:00: 3 real hours, 6 slots, 02:xx never offered', () => {
      expect(starts(sunday('00:00', '04:00'), '2026-03-08', NEW_YORK)).toEqual([
        '2026-03-08T05:00:00.000Z', // 00:00 EST
        '2026-03-08T05:30:00.000Z', // 00:30 EST
        '2026-03-08T06:00:00.000Z', // 01:00 EST
        '2026-03-08T06:30:00.000Z', // 01:30 EST
        '2026-03-08T07:00:00.000Z', // 03:00 EDT
        '2026-03-08T07:30:00.000Z', // 03:30 EDT
      ]);
    });

    it('fall-back 2026-11-01, 00:00-04:00: 5 real hours, 10 slots, 01:xx offered twice', () => {
      expect(starts(sunday('00:00', '04:00'), '2026-11-01', NEW_YORK)).toEqual([
        '2026-11-01T04:00:00.000Z', // 00:00 EDT
        '2026-11-01T04:30:00.000Z', // 00:30 EDT
        '2026-11-01T05:00:00.000Z', // 01:00 EDT
        '2026-11-01T05:30:00.000Z', // 01:30 EDT
        '2026-11-01T06:00:00.000Z', // 01:00 EST
        '2026-11-01T06:30:00.000Z', // 01:30 EST
        '2026-11-01T07:00:00.000Z', // 02:00 EST
        '2026-11-01T07:30:00.000Z', // 02:30 EST
        '2026-11-01T08:00:00.000Z', // 03:00 EST
        '2026-11-01T08:30:00.000Z', // 03:30 EST
      ]);
    });

    it('opening at a nonexistent time (02:30) opens at 03:30 EDT', () => {
      expect(starts(sunday('02:30', '04:00'), '2026-03-08', NEW_YORK)).toEqual([
        '2026-03-08T07:30:00.000Z',
      ]);
    });

    it('a window that collapses after the gap shift (02:30-03:00) yields no slots', () => {
      expect(starts(sunday('02:30', '03:00'), '2026-03-08', NEW_YORK)).toEqual([]);
    });

    it('opening at an ambiguous time (01:30) uses the first occurrence (EDT)', () => {
      expect(starts(sunday('01:30', '03:00'), '2026-11-01', NEW_YORK)).toEqual([
        '2026-11-01T05:30:00.000Z', // 01:30 EDT
        '2026-11-01T06:00:00.000Z', // 01:00 EST
        '2026-11-01T06:30:00.000Z', // 01:30 EST
        '2026-11-01T07:00:00.000Z', // 02:00 EST
        '2026-11-01T07:30:00.000Z', // 02:30 EST
      ]);
    });
  });
});
