import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BOOKING_POLICY } from '../../domain/appointment/booking-policy';
import { createFakeClock } from '../../test/fake-clock';
import { createInMemorySchedulingStore } from '../../test/in-memory-appointments';
import type { AppointmentRecord } from '../appointments/appointments.ports';
import type { ScheduleBlockRecord } from '../schedule-blocks/schedule-blocks.ports';
import { createAvailabilityService } from './availability.service';

const TIME_ZONE = 'America/Sao_Paulo';
const MONDAY_9AM_LOCAL = '2026-10-05T12:00:00.000Z';
const TUESDAY = '2026-10-06';

function setup(now = MONDAY_9AM_LOCAL) {
  const clock = createFakeClock(now);
  const store = createInMemorySchedulingStore();
  const service = createAvailabilityService({
    availability: store.availability,
    clock,
    policy: DEFAULT_BOOKING_POLICY,
    timeZone: TIME_ZONE,
  });
  return { clock, store, service };
}

function appointmentAt(startsAt: string, overrides: Partial<AppointmentRecord> = {}) {
  const start = new Date(startsAt);
  const record: AppointmentRecord = {
    id: randomUUID(),
    userId: randomUUID(),
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    status: 'CONFIRMED',
    notes: null,
    createdAt: new Date(MONDAY_9AM_LOCAL),
    ...overrides,
  };
  return record;
}

describe('availability service', () => {
  it('lists every slot of an open day, as UTC instants of the local grid', async () => {
    const { service } = setup();
    const response = await service.listSlots(TUESDAY);
    expect(response.date).toBe(TUESDAY);
    expect(response.timeZone).toBe(TIME_ZONE);
    expect(response.slots).toHaveLength(18);
    expect(response.slots[0]).toEqual({
      startsAt: '2026-10-06T12:00:00.000Z',
      endsAt: '2026-10-06T12:30:00.000Z',
    });
    expect(response.slots.at(-1)?.endsAt).toBe('2026-10-06T21:00:00.000Z');
  });

  it('returns no slots on a weekday without a rule, without querying appointments', async () => {
    const { service, store } = setup();
    const busy = vi.spyOn(store.availability, 'findBusyRanges');
    expect((await service.listSlots('2026-10-11')).slots).toEqual([]);
    expect(busy).not.toHaveBeenCalled();
  });

  it('returns no slots on a closed date', async () => {
    const { service, store } = setup();
    store.closedDates.add(TUESDAY);
    expect((await service.listSlots(TUESDAY)).slots).toEqual([]);
  });

  it('removes slots taken by active appointments but not by cancelled ones', async () => {
    const { service, store } = setup();
    const taken = appointmentAt('2026-10-06T13:00:00.000Z');
    const completed = appointmentAt('2026-10-06T14:00:00.000Z', { status: 'COMPLETED' });
    const cancelled = appointmentAt('2026-10-06T15:00:00.000Z', { status: 'CANCELLED' });
    for (const row of [taken, completed, cancelled]) store.appointments.set(row.id, row);

    const starts = (await service.listSlots(TUESDAY)).slots.map((slot) => slot.startsAt);
    expect(starts).toHaveLength(16);
    expect(starts).not.toContain('2026-10-06T13:00:00.000Z');
    expect(starts).not.toContain('2026-10-06T14:00:00.000Z');
    expect(starts).toContain('2026-10-06T15:00:00.000Z');
  });

  it('asks for busy ranges over the whole local day', async () => {
    const { service, store } = setup();
    const busy = vi.spyOn(store.availability, 'findBusyRanges');
    await service.listSlots(TUESDAY);
    expect(busy).toHaveBeenCalledWith({
      startsAt: new Date('2026-10-06T03:00:00.000Z'),
      endsAt: new Date('2026-10-07T03:00:00.000Z'),
    });
  });

  it('drops past slots and those inside the minimum lead time', async () => {
    const { service } = setup();
    const starts = (await service.listSlots('2026-10-05')).slots.map((slot) => slot.startsAt);
    expect(starts[0]).toBe('2026-10-05T13:00:00.000Z');
    expect(starts).toHaveLength(16);
  });

  it('returns no slots for a past day or beyond the horizon', async () => {
    const { service } = setup();
    expect((await service.listSlots('2026-10-02')).slots).toEqual([]);
    expect((await service.listSlots('2027-01-05')).slots).toEqual([]);
  });

  describe('with schedule blocks', () => {
    function block(overrides: Partial<ScheduleBlockRecord> = {}): ScheduleBlockRecord {
      return {
        id: randomUUID(),
        weekdays: [1, 2, 3, 4, 5],
        startTime: '13:00',
        endTime: '13:30',
        startsOn: '2026-10-05',
        endsOn: null,
        reason: null,
        createdBy: randomUUID(),
        createdAt: new Date(MONDAY_9AM_LOCAL),
        ...overrides,
      };
    }

    async function startsOn(date: string, ...blocks: ScheduleBlockRecord[]) {
      const { service, store } = setup();
      for (const each of blocks) store.blocks.set(each.id, each);
      return (await service.listSlots(date)).slots.map((slot) => slot.startsAt);
    }

    it('does not offer slots a block covers, even partly', async () => {
      const starts = await startsOn(TUESDAY, block({ startTime: '13:00', endTime: '14:15' }));
      expect(starts).toHaveLength(15);
      expect(starts).not.toContain('2026-10-06T16:00:00.000Z');
      expect(starts).not.toContain('2026-10-06T16:30:00.000Z');
      expect(starts).not.toContain('2026-10-06T17:00:00.000Z');
      expect(starts).toContain('2026-10-06T15:30:00.000Z');
      expect(starts).toContain('2026-10-06T17:30:00.000Z');
    });

    it('ignores blocks for other weekdays and outside their date range', async () => {
      const starts = await startsOn(
        TUESDAY,
        block({ weekdays: [1, 3, 5] }),
        block({ endsOn: '2026-10-05' }),
        block({ startsOn: '2026-10-07' }),
      );
      expect(starts).toHaveLength(18);
    });

    it('combines blocks with booked appointments', async () => {
      const { service, store } = setup();
      const booked = appointmentAt('2026-10-06T12:00:00.000Z');
      store.appointments.set(booked.id, booked);
      const lunch = block();
      store.blocks.set(lunch.id, lunch);
      expect((await service.listSlots(TUESDAY)).slots).toHaveLength(16);
    });
  });
});
