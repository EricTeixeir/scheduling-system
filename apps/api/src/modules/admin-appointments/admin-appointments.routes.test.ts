import { randomUUID } from 'node:crypto';

import {
  adminAppointmentSchema,
  appointmentHistorySchema,
  appointmentSchema,
  paginatedSchema,
} from '@scheduling/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ADMIN_EMAIL,
  book,
  expectProblem,
  loginOrRegisterClient,
  send,
  startTestServer,
} from '../../test/http-client';

const TUESDAY_10AM = '2026-10-06T10:00:00-03:00';
const TUESDAY_10AM_UTC = '2026-10-06T13:00:00.000Z';
const pageSchema = paginatedSchema(adminAppointmentSchema);

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function withBookings() {
  const env = await startTestServer();
  app = env.app;
  const maria = await loginOrRegisterClient(env.app, 'maria@example.com', 'Maria Souza');
  const joao = await loginOrRegisterClient(env.app, 'joao@exemplo.com.br', 'João Lima');
  const first = appointmentSchema.parse((await book(env.app, maria, TUESDAY_10AM)).json());
  await book(env.app, joao, '2026-10-06T11:00:00-03:00');
  const admin = await loginOrRegisterClient(env.app, ADMIN_EMAIL);
  return { ...env, maria, admin, appointmentId: first.id };
}

function changeStatus(server: FastifyInstance, cookie: string, id: string, status: string) {
  return send(server, 'POST', `/api/admin/appointments/${id}/status`, {
    payload: { status },
    headers: { cookie },
  });
}

describe('admin appointment routes: access', () => {
  const routes = (id: string) =>
    [
      ['GET', '/api/admin/appointments'],
      ['POST', `/api/admin/appointments/${id}/status`],
      ['GET', `/api/admin/appointments/${id}/history`],
    ] as const;

  it('requires a session (401) and the ADMIN role (403)', async () => {
    const { app: server, maria, appointmentId } = await withBookings();
    for (const [method, url] of routes(appointmentId)) {
      const anonymous = await send(server, method, url, { payload: { status: 'CANCELLED' } });
      expect(expectProblem(anonymous, 401).code).toBe('UNAUTHENTICATED');
      const client = await send(server, method, url, {
        payload: { status: 'CANCELLED' },
        headers: { cookie: maria },
      });
      expect(expectProblem(client, 403).code).toBe('FORBIDDEN');
    }
  });
});

describe('GET /api/admin/appointments', () => {
  it('lists every client’s appointments with the client, by start time', async () => {
    const { app: server, admin } = await withBookings();
    const response = await send(server, 'GET', '/api/admin/appointments', {
      headers: { cookie: admin },
    });
    expect(response.statusCode).toBe(200);
    const page = pageSchema.parse(response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(page.items.map((item) => [item.startsAt, item.client.name])).toEqual([
      [TUESDAY_10AM_UTC, 'Maria Souza'],
      ['2026-10-06T14:00:00.000Z', 'João Lima'],
    ]);
  });

  it.each([
    ['?q=%20MARIA%20', ['Maria Souza']],
    ['?q=exemplo.com', ['João Lima']],
    ['?status=CANCELLED', []],
    ['?from=2026-10-06&to=2026-10-06&pageSize=1&page=2', ['João Lima']],
    ['?from=2026-10-07', []],
  ])('filters with %s', async (query, names) => {
    const { app: server, admin } = await withBookings();
    const response = await send(server, 'GET', `/api/admin/appointments${query}`, {
      headers: { cookie: admin },
    });
    expect(pageSchema.parse(response.json()).items.map((item) => item.client.name)).toEqual(names);
  });

  it.each([
    `?q=${'a'.repeat(101)}`,
    '?from=2026-10-08&to=2026-10-07',
    '?status=PENDING',
    '?scope=past',
  ])('refuses the query %s with 422', async (query) => {
    const { app: server, admin } = await withBookings();
    const response = await send(server, 'GET', `/api/admin/appointments${query}`, {
      headers: { cookie: admin },
    });
    expect(expectProblem(response, 422).code).toBe('VALIDATION_FAILED');
  });
});

describe('POST /api/admin/appointments/:id/status', () => {
  it('refuses COMPLETED before the start, cancels, then refuses a second change', async () => {
    const { app: server, admin, appointmentId } = await withBookings();
    const early = await changeStatus(server, admin, appointmentId, 'COMPLETED');
    expect(expectProblem(early, 422).code).toBe('NOT_STARTED_YET');

    const cancelled = await changeStatus(server, admin, appointmentId, 'CANCELLED');
    expect(cancelled.statusCode).toBe(200);
    expect(adminAppointmentSchema.parse(cancelled.json())).toMatchObject({
      id: appointmentId,
      status: 'CANCELLED',
      client: { name: 'Maria Souza', email: 'maria@example.com' },
    });

    const again = await changeStatus(server, admin, appointmentId, 'CANCELLED');
    expect(expectProblem(again, 409).code).toBe('INVALID_TRANSITION');
  });

  it('records NO_SHOW from the start on, and refuses CANCELLED then', async () => {
    const { app: server, appointmentId, clock } = await withBookings();
    clock.set(TUESDAY_10AM_UTC);
    const admin = await loginOrRegisterClient(server, ADMIN_EMAIL);
    const late = await changeStatus(server, admin, appointmentId, 'CANCELLED');
    expect(expectProblem(late, 422).code).toBe('ALREADY_STARTED');
    const noShow = await changeStatus(server, admin, appointmentId, 'NO_SHOW');
    expect(adminAppointmentSchema.parse(noShow.json()).status).toBe('NO_SHOW');
  });

  it('answers 404 for an unknown appointment', async () => {
    const { app: server, admin } = await withBookings();
    const response = await changeStatus(server, admin, randomUUID(), 'CANCELLED');
    expect(expectProblem(response, 404).code).toBe('NOT_FOUND');
  });

  it.each([
    ['CONFIRMED', 'a valid id'],
    ['cancelled', 'a valid id'],
    ['CANCELLED', 'not-a-uuid'],
  ])('refuses status %s with %s (422)', async (status, idLabel) => {
    const { app: server, admin, appointmentId } = await withBookings();
    const id = idLabel === 'a valid id' ? appointmentId : idLabel;
    const response = await changeStatus(server, admin, id, status);
    expect(expectProblem(response, 422).code).toBe('VALIDATION_FAILED');
  });

  it('refuses unknown body fields and a missing CSRF header', async () => {
    const { app: server, admin, appointmentId } = await withBookings();
    const extra = await send(server, 'POST', `/api/admin/appointments/${appointmentId}/status`, {
      payload: { status: 'CANCELLED', reason: 'x' },
      headers: { cookie: admin },
    });
    expect(expectProblem(extra, 422).code).toBe('VALIDATION_FAILED');
    const noCsrf = await server.inject({
      method: 'POST',
      url: `/api/admin/appointments/${appointmentId}/status`,
      payload: { status: 'CANCELLED' },
      headers: { cookie: admin },
    });
    expect(expectProblem(noCsrf, 403).code).toBe('FORBIDDEN');
  });
});

describe('GET /api/admin/appointments/:id/history', () => {
  it('shows the creation by the client and the cancellation by the admin', async () => {
    const { app: server, admin, appointmentId } = await withBookings();
    await changeStatus(server, admin, appointmentId, 'CANCELLED');
    const response = await send(server, 'GET', `/api/admin/appointments/${appointmentId}/history`, {
      headers: { cookie: admin },
    });
    expect(response.statusCode).toBe(200);
    const history = appointmentHistorySchema.parse(response.json());
    expect(
      history.items.map(({ action, actor }) => [action, actor.name, actor.role] as const),
    ).toEqual([
      ['APPOINTMENT_CREATED', 'Maria Souza', 'CLIENT'],
      ['APPOINTMENT_CANCELLED', 'Admin', 'ADMIN'],
    ]);
  });

  it('answers 404 for an unknown appointment and 422 for a malformed id', async () => {
    const { app: server, admin } = await withBookings();
    const missing = await send(server, 'GET', `/api/admin/appointments/${randomUUID()}/history`, {
      headers: { cookie: admin },
    });
    expect(expectProblem(missing, 404).code).toBe('NOT_FOUND');
    const malformed = await send(server, 'GET', '/api/admin/appointments/abc/history', {
      headers: { cookie: admin },
    });
    expect(expectProblem(malformed, 422).code).toBe('VALIDATION_FAILED');
  });
});
