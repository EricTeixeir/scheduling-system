import { describe, expect, it } from 'vitest';

import type { TimeRange } from '../time/time-range';
import {
  assertValidScheduleBlock,
  blockAppliesOn,
  blockOccurrenceOn,
  blockOverlaps,
  type ScheduleBlock,
} from './schedule-block';

const SAO_PAULO = 'America/Sao_Paulo';

// 2026-10-05 is a Monday.
const WEEKDAYS_FOREVER: ScheduleBlock = {
  weekdays: [1, 2, 3, 4, 5],
  startTime: '13:00',
  endTime: '13:30',
  startsOn: '2026-10-05',
  endsOn: null,
};

const MON_WED_FRI_TWO_WEEKS: ScheduleBlock = {
  weekdays: [1, 3, 5],
  startTime: '13:00',
  endTime: '13:30',
  startsOn: '2026-10-05',
  endsOn: '2026-10-18',
};

function range(startsAt: string, endsAt: string): TimeRange {
  return { startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}

describe('assertValidScheduleBlock', () => {
  it('accepts the examples', () => {
    expect(() => {
      assertValidScheduleBlock(WEEKDAYS_FOREVER);
      assertValidScheduleBlock(MON_WED_FRI_TWO_WEEKS);
      assertValidScheduleBlock({ ...WEEKDAYS_FOREVER, endsOn: '2026-10-05' });
    }).not.toThrow();
  });

  it.each([
    [{ weekdays: [] }, 'weekdays must be integers 0-6'],
    [{ weekdays: [7] }, 'weekdays must be integers 0-6'],
    [{ weekdays: [1.5] }, 'weekdays must be integers 0-6'],
    [{ startTime: '13:30' }, 'must be before endTime'],
    [{ endTime: '24:00' }, 'HH:mm'],
    [{ startsOn: '2026-02-30' }, 'YYYY-MM-DD'],
    [{ endsOn: '2026-10-32' }, 'YYYY-MM-DD'],
    [{ endsOn: '2026-10-04' }, 'must not be before startsOn'],
  ])('rejects %j', (override, message) => {
    expect(() => {
      assertValidScheduleBlock({ ...WEEKDAYS_FOREVER, ...override });
    }).toThrow(message);
  });
});

describe('blockAppliesOn', () => {
  it('applies forever on the listed weekdays only', () => {
    expect(blockAppliesOn(WEEKDAYS_FOREVER, '2026-10-05')).toBe(true);
    expect(blockAppliesOn(WEEKDAYS_FOREVER, '2030-01-04')).toBe(true);
    expect(blockAppliesOn(WEEKDAYS_FOREVER, '2026-10-10')).toBe(false);
    expect(blockAppliesOn(WEEKDAYS_FOREVER, '2026-10-11')).toBe(false);
  });

  it('does not apply before startsOn', () => {
    expect(blockAppliesOn(WEEKDAYS_FOREVER, '2026-10-02')).toBe(false);
  });

  it('applies on both edges of a bounded range and not after it', () => {
    expect(blockAppliesOn(MON_WED_FRI_TWO_WEEKS, '2026-10-05')).toBe(true);
    expect(blockAppliesOn(MON_WED_FRI_TWO_WEEKS, '2026-10-16')).toBe(true);
    expect(blockAppliesOn(MON_WED_FRI_TWO_WEEKS, '2026-10-19')).toBe(false);
    expect(blockAppliesOn({ ...MON_WED_FRI_TWO_WEEKS, endsOn: '2026-10-19' }, '2026-10-19')).toBe(
      true,
    );
  });

  it('filters weekdays inside the range', () => {
    expect(blockAppliesOn(MON_WED_FRI_TWO_WEEKS, '2026-10-06')).toBe(false);
    expect(blockAppliesOn(MON_WED_FRI_TWO_WEEKS, '2026-10-07')).toBe(true);
  });

  it('a single-day block applies only that day', () => {
    const single = { ...WEEKDAYS_FOREVER, weekdays: [0, 1, 2, 3, 4, 5, 6], endsOn: '2026-10-05' };
    expect(blockAppliesOn(single, '2026-10-05')).toBe(true);
    expect(blockAppliesOn(single, '2026-10-06')).toBe(false);
  });

  it('throws on an invalid date', () => {
    expect(() => blockAppliesOn(WEEKDAYS_FOREVER, '2026-02-30')).toThrow('YYYY-MM-DD');
  });
});

describe('blockOccurrenceOn', () => {
  it('is the local wall-clock period on that date, as UTC instants', () => {
    expect(blockOccurrenceOn(WEEKDAYS_FOREVER, '2026-10-06', SAO_PAULO)).toEqual(
      range('2026-10-06T16:00:00.000Z', '2026-10-06T16:30:00.000Z'),
    );
    expect(blockOccurrenceOn(WEEKDAYS_FOREVER, '2026-10-06', 'UTC')).toEqual(
      range('2026-10-06T13:00:00.000Z', '2026-10-06T13:30:00.000Z'),
    );
  });

  it('is undefined on a date the block does not apply to', () => {
    expect(blockOccurrenceOn(WEEKDAYS_FOREVER, '2026-10-11', SAO_PAULO)).toBeUndefined();
  });

  it('throws on an unknown time zone', () => {
    expect(() => blockOccurrenceOn(WEEKDAYS_FOREVER, '2026-10-06', 'Nope/Zone')).toThrow(
      'unknown time zone',
    );
  });
});

describe('blockOverlaps', () => {
  it.each([
    ['the blocked slot', '2026-10-07T16:00:00.000Z', '2026-10-07T16:30:00.000Z', true],
    ['a partly blocked hour', '2026-10-07T15:30:00.000Z', '2026-10-07T16:30:00.000Z', true],
    ['the slot right before', '2026-10-07T15:30:00.000Z', '2026-10-07T16:00:00.000Z', false],
    ['the slot right after', '2026-10-07T16:30:00.000Z', '2026-10-07T17:00:00.000Z', false],
    ['a Tuesday', '2026-10-06T16:00:00.000Z', '2026-10-06T16:30:00.000Z', false],
    ['after the range', '2026-10-19T16:00:00.000Z', '2026-10-19T16:30:00.000Z', false],
  ])('%s -> %s', (_label, startsAt, endsAt, expected) => {
    expect(blockOverlaps(MON_WED_FRI_TWO_WEEKS, range(startsAt, endsAt), SAO_PAULO)).toBe(expected);
  });

  it('finds an occurrence on the local date where a range crossing midnight ends', () => {
    const lateNight: ScheduleBlock = { ...WEEKDAYS_FOREVER, startTime: '00:00', endTime: '00:30' };
    // Monday 23:30 to Tuesday 00:30 in Sao Paulo.
    const crossing = range('2026-10-06T02:30:00.000Z', '2026-10-06T03:30:00.000Z');
    expect(blockOverlaps(lateNight, crossing, SAO_PAULO)).toBe(true);
  });
});
