import { randomUUID } from 'node:crypto';

import {
  createScheduleBlockSchema,
  MAX_LISTED_CONFLICTS,
  type AppointmentStatus,
  type CreateScheduleBlockInput,
} from '@scheduling/shared';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BOOKING_POLICY } from '../../domain/appointment/booking-policy';
import { AppError, BlockConflictError } from '../../errors/app-errors';
import { createFakeClock } from '../../test/fake-clock';
import { createInMemoryAdminRepositories, type DirectoryEntry } from '../../test/in-memory-admin';
import { createInMemorySchedulingStore } from '../../test/in-memory-appointments';
import type { AppointmentRecord } from '../appointments/appointments.ports';
import type { RequestContext } from '../appointments/appointments.service';
import { conflictDetail, createScheduleBlocksService } from './schedule-blocks.service';

const TIME_ZONE = 'America/Sao_Paulo';
const MONDAY_9AM_LOCAL = '2026-10-05T12:00:00.000Z';

const MARIA: DirectoryEntry = {
  id: randomUUID(),
  name: 'Maria',
  email: 'maria@example.com',
  role: 'CLIENT',
};
const ADMIN: DirectoryEntry = {
  id: randomUUID(),
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
};
const ADMIN_CONTEXT: RequestContext = {
  actor: { id: ADMIN.id, role: 'ADMIN' },
  requestId: 'request-1',
};

const WEEKDAYS_1PM: CreateScheduleBlockInput = {
  weekdays: [1, 2, 3, 4, 5],
  startTime: '13:00',
  endTime: '13:30',
  startsOn: '2026-10-05',
};

function setup() {
  const clock = createFakeClock(MONDAY_9AM_LOCAL);
  const store = createInMemorySchedulingStore();
  const directory = new Map([MARIA, ADMIN].map((entry) => [entry.id, entry]));
  const { scheduleBlocks } = createInMemoryAdminRepositories(store, directory);
  const service = createScheduleBlocksService({
    blocks: scheduleBlocks,
    clock,
    policy: DEFAULT_BOOKING_POLICY,
    timeZone: TIME_ZONE,
  });
  const create = (input: CreateScheduleBlockInput) =>
    service.create(ADMIN_CONTEXT, createScheduleBlockSchema.parse(input));
  return { clock, store, service, create, repository: scheduleBlocks };
}

function appointmentAt(startsAt: string, status: AppointmentStatus = 'CONFIRMED') {
  const start = new Date(startsAt);
  const record: AppointmentRecord = {
    id: randomUUID(),
    userId: MARIA.id,
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    status,
    notes: null,
    createdAt: new Date(MONDAY_9AM_LOCAL),
  };
  return record;
}

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
}

describe('create', () => {
  it('stores a forever block and records BLOCK_CREATED without the reason', async () => {
    const { create, store } = setup();
    const block = await create({ ...WEEKDAYS_1PM, reason: 'Buscar o filho na escola' });
    expect(block).toEqual({
      id: expect.any(String) as string,
      weekdays: [1, 2, 3, 4, 5],
      startTime: '13:00',
      endTime: '13:30',
      startsOn: '2026-10-05',
      endsOn: null,
      reason: 'Buscar o filho na escola',
      createdAt: MONDAY_9AM_LOCAL,
    });
    expect(store.blocks.get(block.id)).toMatchObject({ createdBy: ADMIN.id });
    expect(store.auditEvents).toEqual([
      {
        occurredAt: new Date(MONDAY_9AM_LOCAL),
        actorId: ADMIN.id,
        actorRole: 'ADMIN',
        action: 'BLOCK_CREATED',
        entityType: 'SCHEDULE_BLOCK',
        entityId: block.id,
        fromStatus: null,
        toStatus: null,
        requestId: 'request-1',
        metadata: {
          weekdays: '1,2,3,4,5',
          startTime: '13:00',
          endTime: '13:30',
          startsOn: '2026-10-05',
        },
      },
    ]);
  });

  it('keeps endsOn in the block and in the audit metadata', async () => {
    const { create, store } = setup();
    const block = await create({ ...WEEKDAYS_1PM, weekdays: [1, 3, 5], endsOn: '2026-10-18' });
    expect(block).toMatchObject({ weekdays: [1, 3, 5], endsOn: '2026-10-18', reason: null });
    expect(store.auditEvents[0]?.metadata).toMatchObject({ endsOn: '2026-10-18' });
  });

  it('refuses a block over a future CONFIRMED appointment and lists it (409)', async () => {
    const { create, store } = setup();
    const appointment = appointmentAt('2026-10-07T16:00:00.000Z');
    store.appointments.set(appointment.id, appointment);

    const error = await refusal(create(WEEKDAYS_1PM));
    expect(error).toBeInstanceOf(BlockConflictError);
    expect(error).toMatchObject({
      status: 409,
      code: 'BLOCK_CONFLICT',
      detail: conflictDetail(1),
      conflicts: [
        {
          appointmentId: appointment.id,
          startsAt: '2026-10-07T16:00:00.000Z',
          endsAt: '2026-10-07T16:30:00.000Z',
          clientName: 'Maria',
        },
      ],
    });
    expect(store.blocks.size).toBe(0);
    expect(store.auditEvents).toEqual([]);
  });

  it.each([
    ['a cancelled appointment', appointmentAt('2026-10-07T16:00:00.000Z', 'CANCELLED')],
    ['an adjacent slot', appointmentAt('2026-10-07T16:30:00.000Z')],
    ['a day outside the weekdays', appointmentAt('2026-10-10T16:00:00.000Z')],
    ['a day before startsOn', appointmentAt('2026-10-02T16:00:00.000Z')],
    ['a past appointment', appointmentAt('2026-10-05T11:00:00.000Z')],
    ['one already started', appointmentAt('2026-10-05T12:00:00.000Z')],
  ])('ignores %s', async (_label, appointment) => {
    const { create, store } = setup();
    store.appointments.set(appointment.id, appointment);
    const block = await create(WEEKDAYS_1PM);
    expect(store.blocks.has(block.id)).toBe(true);
  });

  it('ignores appointments after the end of a bounded block', async () => {
    const { create, store } = setup();
    const appointment = appointmentAt('2026-10-19T16:00:00.000Z');
    store.appointments.set(appointment.id, appointment);
    await expect(create({ ...WEEKDAYS_1PM, endsOn: '2026-10-18' })).resolves.toBeDefined();
  });

  it('checks a forever block only up to the booking horizon', async () => {
    const { create, repository } = setup();
    const find = vi.spyOn(repository, 'findConfirmedStartingBetween');
    await create(WEEKDAYS_1PM);
    expect(find).toHaveBeenCalledWith(
      new Date(MONDAY_9AM_LOCAL),
      new Date('2027-01-03T12:00:00.000Z'),
    );
  });

  it(`lists at most ${String(MAX_LISTED_CONFLICTS)} conflicts and states the total`, async () => {
    const { create, store } = setup();
    const total = MAX_LISTED_CONFLICTS + 2;
    for (let day = 0; day < total; day += 1) {
      const startsAt = new Date(Date.UTC(2026, 9, 6 + day, 16));
      const appointment = appointmentAt(startsAt.toISOString());
      store.appointments.set(appointment.id, appointment);
    }
    const error = await refusal(create({ ...WEEKDAYS_1PM, weekdays: [0, 1, 2, 3, 4, 5, 6] }));
    expect(error.conflicts).toHaveLength(MAX_LISTED_CONFLICTS);
    expect(error.detail).toBe(conflictDetail(total));
    expect(error.conflicts?.[0]?.startsAt).toBe('2026-10-06T16:00:00.000Z');
  });
});

describe('conflictDetail', () => {
  it('speaks of one appointment, several, and a truncated list', () => {
    expect(conflictDetail(1)).toMatch(/^Um agendamento confirmado coincide/);
    expect(conflictDetail(3)).toMatch(/^3 agendamentos confirmados coincidem/);
    expect(conflictDetail(3)).not.toMatch(/primeiros/);
    expect(conflictDetail(MAX_LISTED_CONFLICTS + 1)).toMatch(/A lista mostra os 50 primeiros\.$/);
  });
});

describe('list', () => {
  it('orders blocks by their first day', async () => {
    const { create, service } = setup();
    await create({ ...WEEKDAYS_1PM, startsOn: '2026-11-01' });
    await create({ ...WEEKDAYS_1PM, startsOn: '2026-10-10' });
    const starts = (await service.list()).map((block) => block.startsOn);
    expect(starts).toEqual(['2026-10-10', '2026-11-01']);
  });
});

describe('removeIfExists', () => {
  it('deletes the block and records BLOCK_DELETED once', async () => {
    const { create, service, store } = setup();
    const block = await create(WEEKDAYS_1PM);
    await service.removeIfExists(ADMIN_CONTEXT, block.id);
    await service.removeIfExists(ADMIN_CONTEXT, block.id);
    expect(store.blocks.size).toBe(0);
    expect(store.auditEvents.map((event) => event.action)).toEqual([
      'BLOCK_CREATED',
      'BLOCK_DELETED',
    ]);
    expect(store.auditEvents[1]).toMatchObject({
      entityType: 'SCHEDULE_BLOCK',
      entityId: block.id,
      metadata: { weekdays: '1,2,3,4,5', startTime: '13:00', endTime: '13:30' },
    });
  });

  it('succeeds without recording anything for an unknown block', async () => {
    const { service, store } = setup();
    await expect(service.removeIfExists(ADMIN_CONTEXT, randomUUID())).resolves.toBeUndefined();
    expect(store.auditEvents).toEqual([]);
  });
});
