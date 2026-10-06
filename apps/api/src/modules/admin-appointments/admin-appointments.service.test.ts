import { randomUUID } from 'node:crypto';

import {
  adminAppointmentsQuerySchema,
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
import { NOT_FOUND_DETAIL, type RequestContext } from '../appointments/appointments.service';
import type { AdminAppointmentRepository } from './admin-appointments.ports';
import { createAdminAppointmentsService, NOT_CONFIRMED_DETAIL } from './admin-appointments.service';

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

function setup(override?: (base: AdminAppointmentRepository) => AdminAppointmentRepository) {
  const clock = createFakeClock(MONDAY_9AM_LOCAL);
  const store = createInMemorySchedulingStore();
  const directory = new Map([MARIA, JOAO, ADMIN].map((entry) => [entry.id, entry]));
  const { adminAppointments } = createInMemoryAdminRepositories(store, directory);
  const repository = override ? override(adminAppointments) : adminAppointments;
  const service = createAdminAppointmentsService({
    appointments: repository,
    clock,
    policy: DEFAULT_BOOKING_POLICY,
    timeZone: TIME_ZONE,
  });
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
