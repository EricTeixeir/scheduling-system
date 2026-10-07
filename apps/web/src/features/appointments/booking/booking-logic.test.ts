import { describe, expect, it, vi } from 'vitest';

import { createAttemptKeys } from './attempt-keys';
import { groupSlotsByPeriod } from './day-periods';
import { durationLimitsAt, gridSlotsOf, mySlotsOf } from './grid-slots';
import {
  canGoToPreviousWeek,
  selectDay,
  shiftWeek,
  startSelection,
  visibleDays,
} from './day-selection';

const SAO_PAULO = 'America/Sao_Paulo';

function slotAt(localHour: number, minute = 0) {
  const startsAt = new Date(Date.UTC(2026, 9, 7, localHour + 3, minute));
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
  };
}

describe('groupSlotsByPeriod', () => {
  it('splits slots into Manhã, Tarde and Noite by the local hour', () => {
    const slots = [slotAt(8), slotAt(11, 30), slotAt(12), slotAt(17, 30), slotAt(18), slotAt(21)];

    const groups = groupSlotsByPeriod(slots, SAO_PAULO);

    expect(groups.map((group) => [group.period.label, group.slots.length])).toEqual([
      ['Manhã', 2],
      ['Tarde', 2],
      ['Noite', 2],
    ]);
  });

  it('omits periods without slots', () => {
    expect(groupSlotsByPeriod([slotAt(14)], SAO_PAULO).map((group) => group.period.id)).toEqual([
      'afternoon',
    ]);
    expect(groupSlotsByPeriod([], SAO_PAULO)).toEqual([]);
  });
});

describe('day selection', () => {
  const today = '2026-10-07';

  it('starts on today, showing seven days', () => {
    const selection = startSelection(today);

    expect(selection.selected).toBe(today);
    expect(visibleDays(selection)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ]);
  });

  it('keeps the week when the chosen day is visible and moves it otherwise', () => {
    const selection = startSelection(today);

    expect(selectDay(selection, '2026-10-13')).toEqual({
      firstDay: today,
      selected: '2026-10-13',
    });
    expect(selectDay(selection, '2026-10-14')).toEqual({
      firstDay: '2026-10-14',
      selected: '2026-10-14',
    });
  });

  it('moves by weeks, never before today', () => {
    const next = shiftWeek(startSelection(today), 1, today);

    expect(next).toEqual({ firstDay: '2026-10-14', selected: '2026-10-14' });
    expect(canGoToPreviousWeek(next, today)).toBe(true);
    expect(shiftWeek(selectDay(next, '2026-10-17'), -1, today).firstDay).toBe(today);
    expect(canGoToPreviousWeek(startSelection(today), today)).toBe(false);
  });
});

describe('createAttemptKeys', () => {
  it('reuses the key to retry the same request and renews it for another one', () => {
    const generate = vi.fn().mockReturnValueOnce('k1').mockReturnValueOnce('k2');
    const keys = createAttemptKeys(generate);

    expect(keys.keyFor('slot-a|')).toBe('k1');
    expect(keys.keyFor('slot-a|')).toBe('k1');
    expect(keys.keyFor('slot-a|nota')).toBe('k2');
  });

  it('renews the key after a reset, even for the same request', () => {
    const generate = vi.fn().mockReturnValueOnce('k1').mockReturnValueOnce('k2');
    const keys = createAttemptKeys(generate);

    keys.keyFor('slot-a|');
    keys.reset();

    expect(keys.keyFor('slot-a|')).toBe('k2');
  });
});

describe('gridSlotsOf', () => {
  const mine = {
    id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
    ...slotAt(10),
    status: 'CONFIRMED' as const,
    notes: null,
    createdAt: '2026-10-01T12:00:00.000Z',
  };

  it('merges my confirmed appointments of the day with the free slots, in time order', () => {
    const otherDay = { ...mine, id: 'other', startsAt: '2026-10-08T13:00:00.000Z' };
    const cancelled = { ...mine, id: 'cancelled', status: 'CANCELLED' as const };

    const slots = gridSlotsOf(
      [slotAt(9), slotAt(11)],
      mySlotsOf([mine, otherDay, cancelled]),
      '2026-10-07',
      SAO_PAULO,
    );

    expect(slots.map((slot) => slot.kind)).toEqual(['free', 'mine', 'free']);
    expect(slots[1]).toMatchObject({ kind: 'mine', appointmentId: mine.id });
  });

  it('marks every slot a longer appointment covers and drops the free slots it overlaps', () => {
    const twoHours = { ...mine, endsAt: slotAt(12).startsAt };

    const slots = gridSlotsOf(
      [slotAt(9, 30), slotAt(10, 30), slotAt(12)],
      mySlotsOf([twoHours]),
      '2026-10-07',
      SAO_PAULO,
    );

    expect(slots.map(({ kind, startsAt }) => [kind, startsAt])).toEqual([
      ['free', slotAt(9, 30).startsAt],
      ['mine', slotAt(10).startsAt],
      ['mine', slotAt(10, 30).startsAt],
      ['mine', slotAt(11).startsAt],
      ['mine', slotAt(11, 30).startsAt],
      ['free', slotAt(12).startsAt],
    ]);
    expect(slots[4]?.endsAt).toBe(slotAt(12).startsAt);
  });

  it('shows booked appointments of any client, winning over a free slot at the same time', () => {
    const booked = {
      ...slotAt(14),
      kind: 'booked' as const,
      appointmentId: mine.id,
      clientName: 'Ana Souza',
    };

    const slots = gridSlotsOf([slotAt(13, 30), slotAt(14)], [booked], '2026-10-07', SAO_PAULO);

    expect(slots).toEqual([{ ...slotAt(13, 30), kind: 'free' }, booked]);
  });
});

describe('durationLimitsAt', () => {
  const free = (localHour: number, minute = 0) => ({
    ...slotAt(localHour, minute),
    kind: 'free' as const,
  });

  it('extends over the consecutive free slots, stopping at a gap', () => {
    const slots = [free(10), free(10, 30), free(11), free(12)];

    expect(durationLimitsAt(slots, slotAt(10))).toEqual({ slotMinutes: 30, maxMinutes: 90 });
    expect(durationLimitsAt(slots, slotAt(12))).toEqual({ slotMinutes: 30, maxMinutes: 30 });
  });

  it('stops at an occupied slot', () => {
    const mine = { ...slotAt(10, 30), kind: 'mine' as const, appointmentId: 'a' };

    expect(durationLimitsAt([free(10), mine, free(11)], slotAt(10)).maxMinutes).toBe(30);
  });

  it('caps the duration at the longest appointment allowed', () => {
    const day = Array.from({ length: 10 }, (_, index) =>
      free(8 + Math.floor(index / 2), (index % 2) * 30),
    );

    expect(durationLimitsAt(day, slotAt(8)).maxMinutes).toBe(180);
  });
});
