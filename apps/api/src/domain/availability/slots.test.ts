import { describe, expect, it } from 'vitest';

import type { BookingPolicy } from '../appointment/booking-policy';
import { listAvailableSlots, resolveRequestedSlot, type AvailableSlotsQuery } from './slots';
import type { TimeRange } from '../time/time-range';
import type { WeeklyHours } from './weekly-hours';

const SAO_PAULO = 'America/Sao_Paulo';
const POLICY: BookingPolicy = { minLeadMinutes: 60, cancelDeadlineMinutes: 30, horizonDays: 90 };
const MONDAY: WeeklyHours = { weekday: 1, opensAt: '09:00', closesAt: '12:00', slotMinutes: 30 };
// Sunday before the Monday under test.
const NOW = new Date('2026-10-04T12:00:00.000Z');

// Monday 2026-10-05 in Sao Paulo (UTC-3): local 09:00 is 12:00Z.
function sp(hhmm: string): Date {
  return new Date(`2026-10-05T${hhmm}:00.000-03:00`);
}

function range(from: string, to: string): TimeRange {
  return { startsAt: sp(from), endsAt: sp(to) };
}

function list(overrides: Partial<AvailableSlotsQuery> = {}): string[] {
  return listAvailableSlots({
    date: '2026-10-05',
    hours: MONDAY,
    isClosedDate: false,
    busy: [],
    now: NOW,
    policy: POLICY,
    timeZone: SAO_PAULO,
    ...overrides,
  }).map((slot) => slot.startsAt.toISOString());
}

function local(...hhmm: string[]): string[] {
  return hhmm.map((value) => sp(value).toISOString());
}

describe('listAvailableSlots', () => {
  it('lists every slot of an open day, ascending, as UTC instants', () => {
    expect(list()).toEqual(local('09:00', '09:30', '10:00', '10:30', '11:00', '11:30'));
    expect(list()[0]).toBe('2026-10-05T12:00:00.000Z');
  });

  it('returns slots with endsAt = startsAt + slotMinutes', () => {
    const [first] = listAvailableSlots({
      date: '2026-10-05',
      hours: MONDAY,
      isClosedDate: false,
      busy: [],
      now: NOW,
      policy: POLICY,
      timeZone: SAO_PAULO,
    });
    expect(first).toEqual(range('09:00', '09:30'));
  });

  it('a weekday without business hours (Sunday, null) has no slots', () => {
    expect(list({ date: '2026-10-04', hours: null })).toEqual([]);
  });

  it('a closed date has no slots', () => {
    expect(list({ isClosedDate: true })).toEqual([]);
  });

  describe('busy ranges (half-open)', () => {
    it('removes exactly the busy slot', () => {
      expect(list({ busy: [range('09:30', '10:00')] })).toEqual(
        local('09:00', '10:00', '10:30', '11:00', '11:30'),
      );
    });

    it('adjacent busy ranges remove only themselves, not their neighbours', () => {
      expect(list({ busy: [range('09:00', '09:30'), range('09:30', '10:00')] })).toEqual(
        local('10:00', '10:30', '11:00', '11:30'),
      );
    });

    it('a busy range touching a slot edge does not remove it', () => {
      expect(list({ busy: [range('08:00', '09:00'), range('12:00', '13:00')] })).toEqual(
        local('09:00', '09:30', '10:00', '10:30', '11:00', '11:30'),
      );
    });

    it('a partial overlap removes every slot it touches', () => {
      expect(list({ busy: [range('10:15', '10:45')] })).toEqual(
        local('09:00', '09:30', '11:00', '11:30'),
      );
    });

    it('a busy range of another length (e.g. an old 45-min appointment) is honoured', () => {
      expect(list({ busy: [range('09:00', '09:45')] })).toEqual(
        local('10:00', '10:30', '11:00', '11:30'),
      );
    });
  });

  describe('booking window', () => {
    it('drops slots in the past and within the min lead', () => {
      // now = 10:10 local; min lead 60 -> earliest start 11:10, so only 11:30 remains.
      expect(list({ now: sp('10:10') })).toEqual(local('11:30'));
    });

    it('keeps a slot starting exactly at now + min lead', () => {
      expect(list({ now: sp('10:00') })).toEqual(local('11:00', '11:30'));
    });

    it('a past date has no slots', () => {
      expect(list({ now: new Date('2026-10-06T12:00:00.000Z') })).toEqual([]);
    });

    it('a date beyond the horizon has no slots', () => {
      expect(list({ date: '2027-03-01' })).toEqual([]);
    });

    it('a day straddling the horizon keeps only the bookable slots', () => {
      // Horizon = NOW + 90 days = 2027-01-02T12:00Z = Saturday 09:00 in Sao Paulo.
      const saturday: WeeklyHours = { ...MONDAY, weekday: 6 };
      expect(list({ date: '2027-01-02', hours: saturday })).toEqual(['2027-01-02T12:00:00.000Z']);
    });
  });

  it('does not offer a trailing partial slot', () => {
    expect(list({ hours: { ...MONDAY, closesAt: '10:45' } })).toEqual(
      local('09:00', '09:30', '10:00'),
    );
  });

  describe('programmer errors throw', () => {
    it.each<[string, Partial<AvailableSlotsQuery>, string]>([
      ['invalid date', { date: '2026-02-30' }, 'YYYY-MM-DD'],
      ['invalid date even when closed', { date: 'tomorrow', hours: null }, 'YYYY-MM-DD'],
      ['unknown time zone', { timeZone: 'Mars/Olympus' }, 'unknown time zone'],
      ['invalid now', { now: new Date('x') }, 'now must be a valid Date'],
      ['invalid policy', { policy: { ...POLICY, horizonDays: 0 } }, 'policy.horizonDays'],
      ['hours of another weekday', { date: '2026-10-06' }, 'hours are for weekday 1'],
      ['invalid hours', { hours: { ...MONDAY, slotMinutes: 0 } }, 'slotMinutes'],
    ])('%s', (_label, overrides, message) => {
      expect(() => list(overrides)).toThrow(message);
    });
  });
});

describe('resolveRequestedSlot', () => {
  function resolve(
    startsAt: Date,
    hours: WeeklyHours | null = MONDAY,
    isClosedDate = false,
    timeZone = SAO_PAULO,
  ) {
    return resolveRequestedSlot({ startsAt, hours, isClosedDate, timeZone });
  }

  it('returns the server-computed slot for an aligned start', () => {
    expect(resolve(sp('09:00'))).toEqual({ ok: true, value: range('09:00', '09:30') });
    expect(resolve(sp('11:30'))).toEqual({ ok: true, value: range('11:30', '12:00') });
  });

  it('computes endsAt from the rule, never from the client', () => {
    const result = resolve(sp('09:00'), { ...MONDAY, slotMinutes: 45 });
    expect(result).toEqual({ ok: true, value: range('09:00', '09:45') });
  });

  it.each([
    ['closed date', sp('09:00'), MONDAY, true, 'CLOSED_DATE'],
    [
      'weekday without hours',
      new Date('2026-10-04T12:00:00.000-03:00'),
      null,
      false,
      'CLOSED_DATE',
    ],
    ['before opening', sp('08:30'), MONDAY, false, 'OUTSIDE_BUSINESS_HOURS'],
    [
      '1 ms before opening',
      new Date(sp('09:00').getTime() - 1),
      MONDAY,
      false,
      'OUTSIDE_BUSINESS_HOURS',
    ],
    ['exactly at closing', sp('12:00'), MONDAY, false, 'OUTSIDE_BUSINESS_HOURS'],
    ['after closing', sp('15:00'), MONDAY, false, 'OUTSIDE_BUSINESS_HOURS'],
    ['between boundaries', sp('09:15'), MONDAY, false, 'MISALIGNED'],
    ['non-zero seconds', new Date('2026-10-05T09:00:30.000-03:00'), MONDAY, false, 'MISALIGNED'],
    [
      'non-zero milliseconds',
      new Date('2026-10-05T09:00:00.001-03:00'),
      MONDAY,
      false,
      'MISALIGNED',
    ],
    [
      'misaligned near closing',
      new Date('2026-10-05T11:59:59.999-03:00'),
      MONDAY,
      false,
      'MISALIGNED',
    ],
  ] as const)('%s -> %s', (_label, startsAt, hours, isClosedDate, reason) => {
    expect(resolve(startsAt, hours, isClosedDate)).toEqual({ ok: false, reason });
  });

  it('an aligned start whose slot would end after closing is outside business hours', () => {
    // 09:00-10:45 with 30-min slots: 10:30 is on the grid but 10:30-11:00 does not fit.
    expect(resolve(sp('10:30'), { ...MONDAY, closesAt: '10:45' })).toEqual({
      ok: false,
      reason: 'OUTSIDE_BUSINESS_HOURS',
    });
  });

  it('uses the local date of the request, not the UTC date', () => {
    // Monday 22:00 in Sao Paulo is already Tuesday 01:00 UTC.
    const lateMonday: WeeklyHours = { ...MONDAY, opensAt: '20:00', closesAt: '23:30' };
    expect(resolve(new Date('2026-10-06T01:00:00.000Z'), lateMonday)).toEqual({
      ok: true,
      value: {
        startsAt: new Date('2026-10-06T01:00:00.000Z'),
        endsAt: new Date('2026-10-06T01:30:00.000Z'),
      },
    });
  });

  describe('programmer errors throw', () => {
    it('hours of another weekday than the local date of startsAt', () => {
      expect(() => resolve(new Date('2026-10-06T12:00:00.000-03:00'))).toThrow(
        'hours are for weekday 1',
      );
    });

    it('invalid startsAt or time zone', () => {
      expect(() => resolve(new Date('x'))).toThrow('startsAt must be a valid Date');
      expect(() => resolve(sp('09:00'), MONDAY, false, 'Mars/Olympus')).toThrow(
        'unknown time zone',
      );
    });
  });
});
