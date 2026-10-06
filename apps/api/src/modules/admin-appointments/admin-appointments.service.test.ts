import { randomUUID } from 'node:crypto';

import {
  adminAppointmentsQuerySchema,
  CLIENT_SEARCH_LIMIT,
  type AdminAppointmentsQueryInput,
  type AppointmentStatus,
} from '@scheduling/shared';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BOOKING_POLICY } from '../../domain/appointment/booking-policy';
import { AppError } from '../../errors/app-errors';
import { createFakeClock } from '../../test/fake-clock';
import { createInMemoryAdminRepositories, type DirectoryEntry } from '../../test/in-memory-admin';
import { createInMemorySchedulingStore } from '../../test/in-memory-appointments';
import { appointmentCreatedEvent } from '../appointments/appointment-audit';
import type { AppointmentRecord } from '../appointments/appointments.ports';
import {
  createBooking,
  NOT_FOUND_DETAIL,
  type RequestContext,
} from '../appointments/appointments.service';
import type { AdminAppointmentRepository } from './admin-appointments.ports';
import {
  CLIENT_NOT_FOUND_DETAIL,
  createAdminAppointmentsService,
  NOT_CONFIRMED_DETAIL,
} from './admin-appointments.service';

const TIME_ZONE = 'America/Sao_Paulo';
const MONDAY_9AM_LOCAL = '2026-10-05T12:00:00.000Z';

function person(name: string, email: string, role: DirectoryEntry['role'] = 'CLIENT') {
  return { id: randomUUID(), name, email, role };
}

const MARIA = person('Maria Souza', 'maria@example.com');
const JOAO = person('João Lima', 'joao@exemplo.com.br');
const ADMIN = person('Admin', 'admin@example.com', 'ADMIN');
const ADMIN_CONTEXT: RequestContext = {
  actor: { id: ADMIN.id, role: 'ADMIN' },
  requestId: 'request-1',
};

function row(
  client: DirectoryEntry,
  startsAt: string,
  status: AppointmentStatus = 'CONFIRMED',
): AppointmentRecord {
  const start = new Date(startsAt);
  return {
    id: randomUUID(),
    userId: client.id,
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    status,
    notes: null,
    createdAt: new Date(MONDAY_9AM_LOCAL),
  };
}

function setup(
  override?: (base: AdminAppointmentRepository) => AdminAppointmentRepository,
  people: readonly DirectoryEntry[] = [MARIA, JOAO, ADMIN],
) {
  const clock = createFakeClock(MONDAY_9AM_LOCAL);
  const store = createInMemorySchedulingStore();
  const directory = new Map(people.map((entry) => [entry.id, entry]));
  const { adminAppointments } = createInMemoryAdminRepositories(store, directory);
  const repository = override ? override(adminAppointments) : adminAppointments;
  const rules = { clock, policy: DEFAULT_BOOKING_POLICY, timeZone: TIME_ZONE };
  const book = createBooking({
    appointments: store.repository,
    schedule: store.availability,
    ...rules,
  });
  const service = createAdminAppointmentsService({ appointments: repository, book, ...rules });
  const insert = (...rows: AppointmentRecord[]) => {
    for (const each of rows) store.appointments.set(each.id, each);
  };
  return { clock, store, service, insert, repository };
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

describe('list', () => {
  const tuesdayCancelled = row(JOAO, '2026-10-06T12:00:00.000Z', 'CANCELLED');
  const tuesday = row(MARIA, '2026-10-06T13:00:00.000Z');
  const wednesday = row(MARIA, '2026-10-07T13:00:00.000Z');
  const wednesday2330LocalIsThursdayUtc = row(JOAO, '2026-10-08T02:30:00.000Z');

  function seeded() {
    const env = setup();
    env.insert(wednesday2330LocalIsThursdayUtc, tuesday, wednesday, tuesdayCancelled);
    return env;
  }

  async function ids(query: AdminAppointmentsQueryInput) {
    const { service } = seeded();
    const page = await service.list(adminAppointmentsQuerySchema.parse(query));
    return page.items.map((item) => item.id);
  }

  it('lists every appointment by start time, with its client', async () => {
    const { service } = seeded();
    const page = await service.list(adminAppointmentsQuerySchema.parse({}));
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 4 });
    expect(page.items.map((item) => item.id)).toEqual([
      tuesdayCancelled.id,
      tuesday.id,
      wednesday.id,
      wednesday2330LocalIsThursdayUtc.id,
    ]);
    expect(page.items[1]).toEqual({
      id: tuesday.id,
      startsAt: '2026-10-06T13:00:00.000Z',
      endsAt: '2026-10-06T13:30:00.000Z',
      status: 'CONFIRMED',
      notes: null,
      createdAt: MONDAY_9AM_LOCAL,
      client: { id: MARIA.id, name: MARIA.name, email: MARIA.email },
    });
  });

  it('filters by status', async () => {
    expect(await ids({ status: 'CANCELLED' })).toEqual([tuesdayCancelled.id]);
  });

  it('filters by local calendar days, not UTC days', async () => {
    expect(await ids({ from: '2026-10-07', to: '2026-10-07' })).toEqual([
      wednesday.id,
      wednesday2330LocalIsThursdayUtc.id,
    ]);
    expect(await ids({ from: '2026-10-08' })).toEqual([]);
    expect(await ids({ to: '2026-10-06' })).toEqual([tuesdayCancelled.id, tuesday.id]);
  });

  it('turns local days into a half-open UTC range for the repository', async () => {
    const { service, repository } = setup();
    const list = vi.spyOn(repository, 'list');
    await service.list(
      adminAppointmentsQuerySchema.parse({ from: '2026-10-07', to: '2026-10-07' }),
    );
    expect(list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      startsFrom: new Date('2026-10-07T03:00:00.000Z'),
      startsBefore: new Date('2026-10-08T03:00:00.000Z'),
    });
  });

  it('searches the client name or e-mail, ignoring case', async () => {
    expect(await ids({ q: 'MARIA' })).toEqual([tuesday.id, wednesday.id]);
    expect(await ids({ q: 'exemplo.com' })).toEqual([
      tuesdayCancelled.id,
      wednesday2330LocalIsThursdayUtc.id,
    ]);
    expect(await ids({ q: 'nobody' })).toEqual([]);
  });

  it('combines filters', async () => {
    expect(await ids({ q: 'joão', status: 'CONFIRMED' })).toEqual([
      wednesday2330LocalIsThursdayUtc.id,
    ]);
  });

  it('paginates with the total of all matches', async () => {
    const { service } = seeded();
    const page = await service.list(adminAppointmentsQuerySchema.parse({ page: 2, pageSize: 1 }));
    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 4 });
    expect(page.items.map((item) => item.id)).toEqual([tuesday.id]);
  });
});

describe('updateStatus', () => {
  const STARTS_AT = '2026-10-06T13:00:00.000Z';

  it('cancels before the start and records who did it', async () => {
    const { service, store, insert } = setup();
    const appointment = row(MARIA, STARTS_AT);
    insert(appointment);
    const updated = await service.updateStatus(ADMIN_CONTEXT, appointment.id, 'CANCELLED');
    expect(updated).toMatchObject({ id: appointment.id, status: 'CANCELLED' });
    expect(updated.client.email).toBe(MARIA.email);
    expect(store.appointments.get(appointment.id)?.status).toBe('CANCELLED');
    expect(store.auditEvents).toEqual([
      {
        occurredAt: new Date(MONDAY_9AM_LOCAL),
        actorId: ADMIN.id,
        actorRole: 'ADMIN',
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
        requestId: 'request-1',
        metadata: null,
      },
    ]);
  });

  it('refuses to cancel from the start on (422 ALREADY_STARTED)', async () => {
    const { service, clock, insert, store } = setup();
    const appointment = row(MARIA, STARTS_AT);
    insert(appointment);
    clock.set(STARTS_AT);
    const error = await refusal(service.updateStatus(ADMIN_CONTEXT, appointment.id, 'CANCELLED'));
    expect(error).toMatchObject({ status: 422, code: 'ALREADY_STARTED' });
    expect(store.auditEvents).toEqual([]);
  });

  it.each(['COMPLETED', 'NO_SHOW'] as const)(
    'refuses %s before the start (422 NOT_STARTED_YET)',
    async (status) => {
      const { service, clock, insert } = setup();
      const appointment = row(MARIA, STARTS_AT);
      insert(appointment);
      clock.set('2026-10-06T12:59:59.000Z');
      const error = await refusal(service.updateStatus(ADMIN_CONTEXT, appointment.id, status));
      expect(error).toMatchObject({ status: 422, code: 'NOT_STARTED_YET' });
    },
  );

  it.each([
    ['COMPLETED', 'APPOINTMENT_COMPLETED'],
    ['NO_SHOW', 'APPOINTMENT_NO_SHOW'],
  ] as const)('records %s from the start on', async (status, action) => {
    const { service, clock, insert, store } = setup();
    const appointment = row(MARIA, STARTS_AT);
    insert(appointment);
    clock.set(STARTS_AT);
    const updated = await service.updateStatus(ADMIN_CONTEXT, appointment.id, status);
    expect(updated.status).toBe(status);
    expect(store.auditEvents).toMatchObject([
      { action, fromStatus: 'CONFIRMED', toStatus: status, actorRole: 'ADMIN' },
    ]);
  });

  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)(
    'refuses any change once %s (409 INVALID_TRANSITION)',
    async (current) => {
      const { service, clock, insert } = setup();
      const appointment = row(MARIA, STARTS_AT, current);
      insert(appointment);
      clock.set(STARTS_AT);
      const error = await refusal(service.updateStatus(ADMIN_CONTEXT, appointment.id, 'NO_SHOW'));
      expect(error).toMatchObject({
        status: 409,
        code: 'INVALID_TRANSITION',
        detail: NOT_CONFIRMED_DETAIL,
      });
    },
  );

  it('answers 404 for an unknown appointment', async () => {
    const { service } = setup();
    const error = await refusal(service.updateStatus(ADMIN_CONTEXT, randomUUID(), 'CANCELLED'));
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', detail: NOT_FOUND_DETAIL });
  });

  it('reports a change made by someone else in between as INVALID_TRANSITION', async () => {
    const appointment = row(MARIA, STARTS_AT);
    const { service, insert, store } = setup((base) => ({
      ...base,
      transaction: (work) => {
        store.appointments.set(appointment.id, { ...appointment, status: 'CANCELLED' });
        return base.transaction(work);
      },
    }));
    insert(appointment);
    const error = await refusal(service.updateStatus(ADMIN_CONTEXT, appointment.id, 'CANCELLED'));
    expect(error).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
    expect(store.auditEvents).toEqual([]);
  });

  it('answers 409 CONFLICT when the update matched nothing but the state looks unchanged', async () => {
    const { service, insert } = setup((base) => ({
      ...base,
      transaction: (work) =>
        base.transaction((tx) =>
          work({ ...tx, setStatusIfConfirmed: () => Promise.resolve(undefined) }),
        ),
    }));
    const appointment = row(MARIA, STARTS_AT);
    insert(appointment);
    const error = await refusal(service.updateStatus(ADMIN_CONTEXT, appointment.id, 'CANCELLED'));
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT' });
  });
});

describe('history', () => {
  it('lists the events of one appointment, oldest first, with each actor', async () => {
    const { service, store, insert, clock } = setup();
    const appointment = row(MARIA, '2026-10-06T13:00:00.000Z');
    const other = row(JOAO, '2026-10-06T14:00:00.000Z');
    insert(appointment, other);
    const created = appointmentCreatedEvent(
      {
        actor: { id: MARIA.id, role: 'CLIENT' },
        requestId: 'request-0',
        now: new Date('2026-10-05T11:00:00.000Z'),
      },
      appointment,
    );
    await service.updateStatus(ADMIN_CONTEXT, appointment.id, 'CANCELLED');
    store.auditEvents.push(
      created,
      appointmentCreatedEvent(
        { actor: { id: JOAO.id, role: 'CLIENT' }, requestId: 'request-2', now: clock.now() },
        other,
      ),
    );

    const history = await service.history(appointment.id);
    expect(history.items).toMatchObject([
      {
        occurredAt: '2026-10-05T11:00:00.000Z',
        action: 'APPOINTMENT_CREATED',
        fromStatus: null,
        toStatus: 'CONFIRMED',
        actor: { id: MARIA.id, name: MARIA.name, role: 'CLIENT' },
      },
      {
        occurredAt: MONDAY_9AM_LOCAL,
        action: 'APPOINTMENT_CANCELLED',
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
        actor: { id: ADMIN.id, name: ADMIN.name, role: 'ADMIN' },
      },
    ]);
  });

  it('is empty for an appointment without events', async () => {
    const { service, insert } = setup();
    const appointment = row(MARIA, '2026-10-06T13:00:00.000Z');
    insert(appointment);
    expect(await service.history(appointment.id)).toEqual({ items: [] });
  });

  it('answers 404 for an unknown appointment', async () => {
    const { service } = setup();
    expect(await refusal(service.history(randomUUID()))).toMatchObject({ status: 404 });
  });

  it('fails loudly on an action the history contract does not know', async () => {
    const { service, insert, repository } = setup();
    const appointment = row(MARIA, '2026-10-06T13:00:00.000Z');
    insert(appointment);
    vi.spyOn(repository, 'listHistory').mockResolvedValue([
      {
        id: randomUUID(),
        occurredAt: new Date(MONDAY_9AM_LOCAL),
        action: 'APPOINTMENT_TELEPORTED',
        fromStatus: null,
        toStatus: null,
        actor: { id: ADMIN.id, name: ADMIN.name, role: 'ADMIN' },
      },
    ]);
    await expect(service.history(appointment.id)).rejects.toThrow();
  });
});

describe('create', () => {
  const TUESDAY_10AM_UTC = '2026-10-06T13:00:00.000Z';

  function bookFor(
    service: ReturnType<typeof setup>['service'],
    clientId: string,
    idempotencyKey: string = randomUUID(),
  ) {
    return service.create(ADMIN_CONTEXT, {
      idempotencyKey,
      input: { clientId, startsAt: '2026-10-06T10:00:00-03:00', notes: 'Primeira consulta' },
    });
  }

  it('books for the client, with the admin as the audit actor and key owner', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    const result = await bookFor(service, MARIA.id, key);

    expect(result).toMatchObject({ status: 201, replayed: false });
    expect(result.body).toMatchObject({
      startsAt: TUESDAY_10AM_UTC,
      endsAt: '2026-10-06T13:30:00.000Z',
      status: 'CONFIRMED',
      notes: 'Primeira consulta',
      client: { id: MARIA.id, name: MARIA.name, email: MARIA.email },
    });
    expect(store.appointments.get(result.body.id)?.userId).toBe(MARIA.id);
    expect(store.auditEvents).toMatchObject([
      { action: 'APPOINTMENT_CREATED', actorId: ADMIN.id, actorRole: 'ADMIN' },
    ]);
    expect([...store.idempotencyKeys.values()]).toMatchObject([{ userId: ADMIN.id, key }]);
  });

  it('replays the same request with the client, and refuses the key for another client', async () => {
    const { service, store } = setup();
    const key = randomUUID();
    const first = await bookFor(service, MARIA.id, key);
    const replay = await bookFor(service, MARIA.id, key);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(store.appointments.size).toBe(1);

    const otherClient = await refusal(bookFor(service, JOAO.id, key));
    expect(otherClient).toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it.each([
    ['an unknown id', randomUUID()],
    ['an admin id', ADMIN.id],
  ])('answers 404 for %s, booking nothing', async (_label, clientId) => {
    const { service, store } = setup();
    const error = await refusal(bookFor(service, clientId));
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: CLIENT_NOT_FOUND_DETAIL,
    });
    expect(store.appointments.size).toBe(0);
    expect(store.auditEvents).toEqual([]);
  });

  it('applies the booking rules: a taken slot is 409 SLOT_TAKEN', async () => {
    const { service, insert } = setup();
    insert(row(JOAO, TUESDAY_10AM_UTC));
    const error = await refusal(bookFor(service, MARIA.id));
    expect(error).toMatchObject({ status: 409, code: 'SLOT_TAKEN' });
  });

  it('applies the booking rules: a closed date is refused', async () => {
    const { service, store } = setup();
    store.closedDates.add('2026-10-06');
    const error = await refusal(bookFor(service, MARIA.id));
    expect(error).toMatchObject({ status: 422, code: 'CLOSED_DATE' });
  });
});

describe('searchClients', () => {
  it('matches name or e-mail ignoring case, among clients only, ordered by name', async () => {
    const { service } = setup();
    expect(await service.searchClients('EXAMPLE.COM')).toEqual({
      items: [{ id: MARIA.id, name: MARIA.name, email: MARIA.email }],
    });
    expect((await service.searchClients('o')).items.map((client) => client.name)).toEqual([
      JOAO.name,
      MARIA.name,
    ]);
    expect(await service.searchClients('admin')).toEqual({ items: [] });
  });

  it('returns at most CLIENT_SEARCH_LIMIT clients', async () => {
    const many = Array.from({ length: CLIENT_SEARCH_LIMIT + 2 }, (_, index) =>
      person(`Cliente ${String(index).padStart(2, '0')}`, `c${String(index)}@example.com`),
    );
    const { items } = await setup(undefined, many).service.searchClients('cliente');
    expect(items).toHaveLength(CLIENT_SEARCH_LIMIT);
    expect(items[0]?.name).toBe('Cliente 00');
  });
});

describe('summary', () => {
  it('counts by business-time-zone days around the fixed clock', async () => {
    const { service, insert } = setup();
    insert(
      row(MARIA, '2026-10-05T04:00:00.000Z'),
      row(MARIA, '2026-10-05T02:30:00.000Z'),
      row(MARIA, '2026-10-05T13:00:00.000Z'),
      row(JOAO, '2026-10-12T02:59:00.000Z'),
      row(JOAO, '2026-10-12T03:00:00.000Z'),
      row(MARIA, '2026-09-06T03:00:00.000Z', 'COMPLETED'),
      row(MARIA, '2026-09-06T02:59:00.000Z', 'COMPLETED'),
      row(JOAO, '2026-10-05T11:00:00.000Z', 'NO_SHOW'),
      row(JOAO, '2026-10-05T15:00:00.000Z', 'CANCELLED'),
      row(JOAO, '2026-10-06T13:00:00.000Z', 'CANCELLED'),
    );
    expect(await service.summary()).toEqual({
      todayConfirmed: 2,
      next7DaysConfirmed: 2,
      completedLast30Days: 1,
      noShowLast30Days: 1,
      cancelledLast30Days: 1,
    });
  });
});
