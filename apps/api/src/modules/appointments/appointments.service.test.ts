import { randomUUID } from 'node:crypto';

import { appointmentSchema, type CreateAppointmentOutput } from '@scheduling/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_BOOKING_POLICY } from '../../domain/appointment/booking-policy';
import { AppError } from '../../errors/app-errors';
import { createFakeClock } from '../../test/fake-clock';
import { createInMemorySchedulingStore } from '../../test/in-memory-appointments';
import type { Actor } from './appointment-audit';
import type { AppointmentRecord, AppointmentRepository } from './appointments.ports';
import {
  createAppointmentsService,
  KEY_IN_FLIGHT_DETAIL,
  NOT_FOUND_DETAIL,
  SLOT_BLOCKED_DETAIL,
  type RequestContext,
} from './appointments.service';
import { IdempotencyKeyTakenError } from './idempotency';

const TIME_ZONE = 'America/Sao_Paulo';
const MONDAY_9AM_LOCAL = '2026-10-05T12:00:00.000Z';
const TUESDAY_10AM = '2026-10-06T10:00:00-03:00';
const TUESDAY_10AM_UTC = '2026-10-06T13:00:00.000Z';

const CLIENT: Actor = { id: randomUUID(), role: 'CLIENT' };
const OTHER_CLIENT: Actor = { id: randomUUID(), role: 'CLIENT' };

function context(actor: Actor = CLIENT, requestId = 'request-1'): RequestContext {
  return { actor, requestId };
}

function setup(repositoryOverride?: (base: AppointmentRepository) => AppointmentRepository) {
  const clock = createFakeClock(MONDAY_9AM_LOCAL);
  const store = createInMemorySchedulingStore();
  const service = createAppointmentsService({
    appointments: repositoryOverride ? repositoryOverride(store.repository) : store.repository,
    schedule: store.availability,
    clock,
    policy: DEFAULT_BOOKING_POLICY,
    timeZone: TIME_ZONE,
  });
  return { clock, store, service };
}

function command(input: CreateAppointmentOutput, idempotencyKey: string = randomUUID()) {
  return { idempotencyKey, input };
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

function appointmentRow(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  const startsAt = overrides.startsAt ?? new Date(TUESDAY_10AM_UTC);
  return {
    id: randomUUID(),
    userId: CLIENT.id,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    status: 'CONFIRMED',
    notes: null,
    createdAt: new Date(MONDAY_9AM_LOCAL),
    ...overrides,
  };
}

function insert(store: ReturnType<typeof setup>['store'], ...rows: AppointmentRecord[]) {
  for (const row of rows) store.appointments.set(row.id, row);
}

describe('create', () => {
  it('books a CONFIRMED appointment whose end comes from the slot grid', async () => {
    const { service, store } = setup();
    const result = await service.create(
      context(),
      command({ startsAt: TUESDAY_10AM, notes: 'Primeira consulta' }),
    );

    expect(result.status).toBe(201);
    expect(result.replayed).toBe(false);
    const body = appointmentSchema.parse(result.body);
    expect(body).toMatchObject({
      startsAt: TUESDAY_10AM_UTC,
      endsAt: '2026-10-06T13:30:00.000Z',
      status: 'CONFIRMED',
      notes: 'Primeira consulta',
      createdAt: MONDAY_9AM_LOCAL,
    });
    expect(store.appointments.get(body.id)).toMatchObject({ userId: CLIENT.id });
  });

  it('stores null notes when none are sent', async () => {
    const { service } = setup();
    const result = await service.create(context(), command({ startsAt: TUESDAY_10AM }));
    expect(appointmentSchema.parse(result.body).notes).toBeNull();
  });

  it.each([
    ['IN_PAST', '2026-10-05T09:00:00-03:00'],
    ['TOO_SOON', '2026-10-05T09:30:00-03:00'],
    ['TOO_FAR', '2027-01-05T10:00:00-03:00'],
    ['CLOSED_DATE', '2026-10-11T10:00:00-03:00'],
    ['OUTSIDE_BUSINESS_HOURS', '2026-10-06T08:00:00-03:00'],
    ['OUTSIDE_BUSINESS_HOURS', '2026-10-06T18:00:00-03:00'],
    ['MISALIGNED', '2026-10-06T10:15:00-03:00'],
  ])('refuses with %s (422) and stores nothing for %s', async (code, startsAt) => {
    const { service, store } = setup();
    const error = await refusal(service.create(context(), command({ startsAt })));
    expect(error).toMatchObject({ status: 422, code });
    expect(store.appointments.size).toBe(0);
    expect(store.idempotencyKeys.size).toBe(0);
    expect(store.auditEvents).toHaveLength(0);
  });

  it('refuses a closed date even on an open weekday', async () => {
    const { service, store } = setup();
    store.closedDates.add('2026-10-06');
    const error = await refusal(service.create(context(), command({ startsAt: TUESDAY_10AM })));
    expect(error).toMatchObject({ status: 422, code: 'CLOSED_DATE' });
  });

  it('answers SLOT_TAKEN (409) when the slot is already booked, storing no key', async () => {
    const { service, store } = setup();
    await service.create(context(), command({ startsAt: TUESDAY_10AM }));
    const losingKey = randomUUID();
    const error = await refusal(
      service.create(context(OTHER_CLIENT), command({ startsAt: TUESDAY_10AM }, losingKey)),
    );
    expect(error).toMatchObject({ status: 409, code: 'SLOT_TAKEN' });
    expect(store.appointments.size).toBe(1);
    expect(store.idempotencyKeys.size).toBe(1);
  });

  it('allows booking a slot again after its appointment was cancelled', async () => {
    const { service, store } = setup();
    insert(store, appointmentRow({ userId: OTHER_CLIENT.id, status: 'CANCELLED' }));
    const result = await service.create(context(), command({ startsAt: TUESDAY_10AM }));
    expect(result.status).toBe(201);
  });
});

describe('create: schedule blocks', () => {
  function blockFrom(startTime: string, endTime: string, endsOn: string | null = null) {
    return {
      id: randomUUID(),
      weekdays: [1, 2, 3, 4, 5],
      startTime,
      endTime,
      startsOn: '2026-10-05',
      endsOn,
      reason: null,
      createdBy: randomUUID(),
      createdAt: new Date(MONDAY_9AM_LOCAL),
    };
  }

  it.each([
    ['covers the whole slot', '10:00', '10:30'],
    ['covers part of the slot', '10:15', '11:00'],
  ])('refuses a slot a block %s (409 SLOT_BLOCKED), storing nothing', async (_label, from, to) => {
    const { service, store } = setup();
    const block = blockFrom(from, to);
    store.blocks.set(block.id, block);
    const error = await refusal(service.create(context(), command({ startsAt: TUESDAY_10AM })));
    expect(error).toMatchObject({ status: 409, code: 'SLOT_BLOCKED', detail: SLOT_BLOCKED_DETAIL });
    expect(store.appointments.size).toBe(0);
    expect(store.idempotencyKeys.size).toBe(0);
    expect(store.auditEvents).toEqual([]);
  });

  it.each([
    ['ends when the slot starts', blockFrom('09:30', '10:00')],
    ['starts when the slot ends', blockFrom('10:30', '11:00')],
    ['ended the day before', blockFrom('10:00', '10:30', '2026-10-05')],
    ['skips that weekday', { ...blockFrom('10:00', '10:30'), weekdays: [1, 3, 5] }],
  ])('books a slot next to a block that %s', async (_label, block) => {
    const { service, store } = setup();
    store.blocks.set(block.id, block);
    const result = await service.create(context(), command({ startsAt: TUESDAY_10AM }));
    expect(result.status).toBe(201);
  });
});

describe('create: idempotency', () => {
  it('replays the stored response for the same key and body without booking again', async () => {
    const { service, store, clock } = setup();
    const key = randomUUID();
    const first = await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    clock.advanceMinutes(5);
    const second = await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));

    expect(second).toEqual({ ...first, replayed: true });
    expect(store.appointments.size).toBe(1);
    expect(store.auditEvents).toHaveLength(1);
  });

  it('treats the same instant written with another offset as the same body', async () => {
    const { service } = setup();
    const key = randomUUID();
    const first = await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    const second = await service.create(context(), command({ startsAt: TUESDAY_10AM_UTC }, key));
    expect(second.body).toEqual(first.body);
    expect(second.replayed).toBe(true);
  });

  it('refuses the same key with a different body (IDEMPOTENCY_KEY_REUSED, 422)', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    const error = await refusal(
      service.create(context(), command({ startsAt: TUESDAY_10AM, notes: 'outra' }, key)),
    );
    expect(error).toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(store.appointments.size).toBe(1);
  });

  it('does not store a failed request, so the same key can be retried', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    await refusal(
      service.create(context(), command({ startsAt: '2026-10-06T10:15:00-03:00' }, key)),
    );
    expect(store.idempotencyKeys.size).toBe(0);
    const retry = await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    expect(retry).toMatchObject({ status: 201, replayed: false });
  });

  it('scopes keys per user', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    const other = await service.create(
      context(OTHER_CLIENT),
      command({ startsAt: '2026-10-06T11:00:00-03:00' }, key),
    );
    expect(other.replayed).toBe(false);
    expect(store.appointments.size).toBe(2);
  });

  it('ignores a key older than 24 hours and lets it be claimed again', async () => {
    const { service, store, clock } = setup();
    const key = randomUUID();
    await service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    clock.advanceMinutes(24 * 60 + 1);
    const result = await service.create(
      context(),
      command({ startsAt: '2026-10-08T10:00:00-03:00' }, key),
    );
    expect(result).toMatchObject({ status: 201, replayed: false });
    expect(store.appointments.size).toBe(2);
    expect(store.idempotencyKeys.size).toBe(1);
  });

  it('books once when two identical requests race; the loser replays the winner', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      service.create(context(), command({ startsAt: TUESDAY_10AM }, key)),
      service.create(context(), command({ startsAt: TUESDAY_10AM }, key)),
    ]);
    expect(a.body).toEqual(b.body);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(store.appointments.size).toBe(1);
    expect(store.auditEvents).toHaveLength(1);
  });

  it('a duplicate that waits on an in-flight claim replays it once it commits', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    let release: () => void = () => undefined;
    store.holdCommitsUntil = new Promise((resolve) => {
      release = resolve;
    });
    const first = service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.holdCommitsUntil = undefined;
    const second = service.create(context(), command({ startsAt: TUESDAY_10AM }, key));
    release();
    const [winner, loser] = await Promise.all([first, second]);
    expect(loser).toEqual({ ...winner, replayed: true });
    expect(store.appointments.size).toBe(1);
  });

  it('answers CONFLICT (409) when the key is taken but the winner is not visible', async () => {
    const { service } = setup((base) => ({
      ...base,
      transaction: () => Promise.reject(new IdempotencyKeyTakenError()),
    }));
    const error = await refusal(service.create(context(), command({ startsAt: TUESDAY_10AM })));
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', detail: KEY_IN_FLIGHT_DETAIL });
  });

  it('propagates unexpected storage failures untouched', async () => {
    const failure = new Error('database down');
    const { service } = setup((base) => ({
      ...base,
      transaction: () => Promise.reject(failure),
    }));
    await expect(service.create(context(), command({ startsAt: TUESDAY_10AM }))).rejects.toBe(
      failure,
    );
  });
});

describe('create: audit', () => {
  it('records who created what, with the request id, in the same transaction', async () => {
    const { service, store } = setup();
    const result = await service.create(
      context(CLIENT, 'request-42'),
      command({ startsAt: TUESDAY_10AM, notes: 'dado pessoal' }),
    );
    const { id } = appointmentSchema.parse(result.body);
    expect(store.auditEvents).toEqual([
      {
        occurredAt: new Date(MONDAY_9AM_LOCAL),
        actorId: CLIENT.id,
        actorRole: 'CLIENT',
        action: 'APPOINTMENT_CREATED',
        entityType: 'APPOINTMENT',
        entityId: id,
        fromStatus: null,
        toStatus: 'CONFIRMED',
        requestId: 'request-42',
        metadata: { startsAt: TUESDAY_10AM_UTC, endsAt: '2026-10-06T13:30:00.000Z' },
      },
    ]);
    expect(JSON.stringify(store.auditEvents)).not.toContain('dado pessoal');
  });

  it('records nothing when the booking fails', async () => {
    const { service, store } = setup();
    await service.create(context(), command({ startsAt: TUESDAY_10AM }));
    await refusal(service.create(context(OTHER_CLIENT), command({ startsAt: TUESDAY_10AM })));
    expect(store.auditEvents).toHaveLength(1);
  });
});

describe('listOwn', () => {
  function seed(store: ReturnType<typeof setup>['store']) {
    const at = (iso: string, userId = CLIENT.id) =>
      appointmentRow({ startsAt: new Date(iso), userId });
    const rows = {
      pastOld: at('2026-10-01T13:00:00.000Z'),
      pastRecent: at('2026-10-02T13:00:00.000Z'),
      soon: at('2026-10-06T13:00:00.000Z'),
      later: at('2026-10-07T13:00:00.000Z'),
      latest: at('2026-10-08T13:00:00.000Z'),
      foreign: at('2026-10-06T14:00:00.000Z', OTHER_CLIENT.id),
    };
    insert(store, ...Object.values(rows));
    return rows;
  }

  it('lists only the caller’s upcoming appointments, soonest first', async () => {
    const { service, store } = setup();
    const rows = seed(store);
    const page = await service.listOwn(CLIENT.id, { scope: 'upcoming', page: 1, pageSize: 20 });
    expect(page.items.map((item) => item.id)).toEqual([
      rows.soon.id,
      rows.later.id,
      rows.latest.id,
    ]);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 3 });
  });

  it('lists past appointments, most recent first', async () => {
    const { service, store } = setup();
    const rows = seed(store);
    const page = await service.listOwn(CLIENT.id, { scope: 'past', page: 1, pageSize: 20 });
    expect(page.items.map((item) => item.id)).toEqual([rows.pastRecent.id, rows.pastOld.id]);
  });

  it('paginates with the total of every page', async () => {
    const { service, store } = setup();
    const rows = seed(store);
    const page = await service.listOwn(CLIENT.id, { scope: 'upcoming', page: 2, pageSize: 2 });
    expect(page.items.map((item) => item.id)).toEqual([rows.latest.id]);
    expect(page.total).toBe(3);
    expect(appointmentSchema.parse(page.items[0])).toEqual(page.items[0]);
  });
});

describe('cancel', () => {
  it('cancels the caller’s confirmed appointment and records the transition', async () => {
    const { service, store } = setup();
    const row = appointmentRow();
    insert(store, row);
    const result = await service.cancel(context(CLIENT, 'request-7'), row.id);

    expect(result).toMatchObject({ id: row.id, status: 'CANCELLED' });
    expect(store.appointments.get(row.id)?.status).toBe('CANCELLED');
    expect(store.auditEvents).toEqual([
      expect.objectContaining({
        actorId: CLIENT.id,
        actorRole: 'CLIENT',
        action: 'APPOINTMENT_CANCELLED',
        entityId: row.id,
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
        requestId: 'request-7',
        metadata: null,
      }),
    ]);
  });

  it('answers 404 for another client’s appointment, exactly as for a missing one', async () => {
    const { service, store } = setup();
    const foreign = appointmentRow({ userId: OTHER_CLIENT.id });
    insert(store, foreign);
    const forForeign = await refusal(service.cancel(context(), foreign.id));
    const forMissing = await refusal(service.cancel(context(), randomUUID()));
    expect(forForeign).toMatchObject({ status: 404, code: 'NOT_FOUND', detail: NOT_FOUND_DETAIL });
    expect(forMissing).toMatchObject({ status: 404, code: 'NOT_FOUND', detail: NOT_FOUND_DETAIL });
    expect(store.appointments.get(foreign.id)?.status).toBe('CONFIRMED');
  });

  it('refuses after the cancellation deadline (422)', async () => {
    const { service, store, clock } = setup();
    const row = appointmentRow();
    insert(store, row);
    clock.set('2026-10-06T12:31:00.000Z');
    const error = await refusal(service.cancel(context(), row.id));
    expect(error).toMatchObject({ status: 422, code: 'CANCEL_DEADLINE_PASSED' });
    expect(store.auditEvents).toHaveLength(0);
  });

  it('refuses an already cancelled appointment (409)', async () => {
    const { service, store } = setup();
    const row = appointmentRow({ status: 'CANCELLED' });
    insert(store, row);
    const error = await refusal(service.cancel(context(), row.id));
    expect(error).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
  });

  it('refuses an admin cancelling after the start (422)', async () => {
    const { service, store, clock } = setup();
    const admin: Actor = { id: randomUUID(), role: 'ADMIN' };
    const row = appointmentRow({ userId: admin.id });
    insert(store, row);
    clock.set(TUESDAY_10AM_UTC);
    const error = await refusal(service.cancel(context(admin), row.id));
    expect(error).toMatchObject({ status: 422, code: 'ALREADY_STARTED' });
  });

  describe('when the status changes between the read and the conditional update', () => {
    function racing(mutate: (store: ReturnType<typeof setup>['store'], id: string) => void) {
      const row = appointmentRow();
      const holder: { store?: ReturnType<typeof setup>['store'] } = {};
      const env = setup((base) => ({
        ...base,
        transaction: (work, options) => {
          if (holder.store !== undefined) mutate(holder.store, row.id);
          return base.transaction(work, options);
        },
      }));
      holder.store = env.store;
      insert(env.store, row);
      return { ...env, row };
    }

    it('answers from the fresh state: cancelled meanwhile -> 409 INVALID_TRANSITION', async () => {
      const { service, store, row } = racing((store, id) => {
        const found = store.appointments.get(id);
        if (found) store.appointments.set(id, { ...found, status: 'CANCELLED' });
      });
      const error = await refusal(service.cancel(context(), row.id));
      expect(error).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
      expect(store.auditEvents).toHaveLength(0);
    });

    it('answers from the fresh state: gone meanwhile -> 404', async () => {
      const { service, row } = racing((store, id) => store.appointments.delete(id));
      const error = await refusal(service.cancel(context(), row.id));
      expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });

    it('answers CONFLICT when the update lost but the row still looks cancellable', async () => {
      const { service, store } = setup((base) => ({
        ...base,
        transaction: (work) =>
          work({
            claimIdempotencyKey: () => Promise.resolve(),
            insertAppointment: () => Promise.resolve(),
            cancelIfConfirmed: () => Promise.resolve(undefined),
            audit: { append: () => Promise.resolve() },
          }),
      }));
      const row = appointmentRow();
      insert(store, row);
      const error = await refusal(service.cancel(context(), row.id));
      expect(error).toMatchObject({ status: 409, code: 'CONFLICT' });
    });
  });
});
