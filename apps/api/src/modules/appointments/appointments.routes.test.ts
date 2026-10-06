import { randomUUID } from 'node:crypto';

import {
  appointmentSchema,
  availabilityResponseSchema,
  paginatedSchema,
  problemDetailsSchema,
  type ProblemDetails,
} from '@scheduling/shared';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../http/csrf';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAY_HEADER } from '../../http/idempotency-key';
import { buildTestApp } from '../../test/build-test-app';
import { createFakeClock } from '../../test/fake-clock';
import { createInMemorySchedulingStore } from '../../test/in-memory-appointments';
import { cheapestArgon2idHasher, createInMemoryUserRepository } from '../../test/in-memory-auth';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies';
import { CREATE_REQUESTS_PER_USER_PER_MINUTE } from './appointments.routes';

const TEST_PASSWORD = 'test-password-123';
const TUESDAY_10AM = '2026-10-06T10:00:00-03:00';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start() {
  const users = createInMemoryUserRepository();
  const scheduling = createInMemorySchedulingStore();
  const clock = createFakeClock('2026-10-05T12:00:00.000Z');
  app = await buildTestApp({ users, scheduling, clock });
  await users.insertIfEmailFree({
    name: 'Admin',
    email: 'admin@example.com',
    passwordHash: await cheapestArgon2idHasher.hash(TEST_PASSWORD),
    role: 'ADMIN',
  });
  return { app, users, scheduling, clock };
}

function send(
  server: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  options: Partial<InjectOptions> = {},
) {
  return server.inject({
    method,
    url,
    ...options,
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, ...options.headers },
  });
}

async function sessionCookie(server: FastifyInstance, email: string): Promise<string> {
  let response = await send(server, 'POST', '/api/auth/login', {
    payload: { email, password: TEST_PASSWORD },
  });
  if (response.statusCode === 401) {
    response = await send(server, 'POST', '/api/auth/register', {
      payload: { name: 'Cliente', email, password: TEST_PASSWORD },
    });
  }
  const issued = response.cookies.find(({ name }) => name === ACCESS_TOKEN_COOKIE);
  if (issued === undefined) throw new Error(`could not sign in ${email}`);
  return `${ACCESS_TOKEN_COOKIE}=${issued.value}`;
}

function book(
  server: FastifyInstance,
  cookie: string,
  payload: object = { startsAt: TUESDAY_10AM },
  key: string | null = randomUUID(),
) {
  return send(server, 'POST', '/api/appointments', {
    payload,
    headers: { cookie, ...(key === null ? {} : { [IDEMPOTENCY_KEY_HEADER]: key }) },
  });
}

function expectProblem(response: LightMyRequestResponse, status: number): ProblemDetails {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
  return problemDetailsSchema.parse(response.json());
}

describe('GET /api/availability', () => {
  it('requires a session', async () => {
    const { app: server } = await start();
    const response = await send(server, 'GET', '/api/availability?date=2026-10-06');
    expect(expectProblem(response, 401).code).toBe('UNAUTHENTICATED');
  });

  it('lists the free slots of a day for any signed-in user', async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'admin@example.com');
    const response = await send(server, 'GET', '/api/availability?date=2026-10-06', {
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = availabilityResponseSchema.parse(response.json());
    expect(body).toMatchObject({ date: '2026-10-06', timeZone: 'America/Sao_Paulo' });
    expect(body.slots).toHaveLength(18);
  });

  it.each(['', '?date=2026-02-30', '?date=2026-10-06&extra=1'])(
    'refuses the query %j with 422',
    async (query) => {
      const { app: server } = await start();
      const cookie = await sessionCookie(server, 'maria@example.com');
      const response = await send(server, 'GET', `/api/availability${query}`, {
        headers: { cookie },
      });
      expect(expectProblem(response, 422).code).toBe('VALIDATION_FAILED');
    },
  );
});

describe('POST /api/appointments', () => {
  it('books a slot (201) and the slot leaves the availability', async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const response = await book(server, cookie, { startsAt: TUESDAY_10AM, notes: ' Retorno ' });
    expect(response.statusCode).toBe(201);
    expect(appointmentSchema.parse(response.json())).toMatchObject({
      startsAt: '2026-10-06T13:00:00.000Z',
      endsAt: '2026-10-06T13:30:00.000Z',
      status: 'CONFIRMED',
      notes: 'Retorno',
    });
    expect(response.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBeUndefined();

    const availability = await send(server, 'GET', '/api/availability?date=2026-10-06', {
      headers: { cookie },
    });
    expect(availabilityResponseSchema.parse(availability.json()).slots).toHaveLength(17);
  });

  it('ignores a client-sent endsAt: the strict body refuses unknown fields', async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const response = await book(server, cookie, {
      startsAt: TUESDAY_10AM,
      endsAt: '2026-10-06T18:00:00-03:00',
    });
    expect(expectProblem(response, 422).code).toBe('VALIDATION_FAILED');
  });

  it('replays the identical response for the same key and body', async () => {
    const { app: server, scheduling } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const key = randomUUID();
    const first = await book(server, cookie, undefined, key);
    const second = await book(server, cookie, undefined, key);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers[IDEMPOTENT_REPLAY_HEADER.toLowerCase()]).toBe('true');
    expect(scheduling.appointments.size).toBe(1);
  });

  it('refuses the same key with another body (422 IDEMPOTENCY_KEY_REUSED)', async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const key = randomUUID();
    await book(server, cookie, undefined, key);
    const response = await book(server, cookie, { startsAt: '2026-10-06T11:00:00-03:00' }, key);
    const problem = expectProblem(response, 422);
    expect(problem.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(problem.title).toBe('Chave de idempotência já usada em outra requisição');
  });

  it.each([
    ['missing', null, 'Cabeçalho obrigatório.'],
    ['not a UUID', 'abc-123', 'Informe um UUID válido.'],
  ])('refuses a %s Idempotency-Key with 400', async (_label, key, message) => {
    const { app: server, scheduling } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const problem = expectProblem(await book(server, cookie, undefined, key), 400);
    expect(problem.code).toBe('VALIDATION_FAILED');
    expect(problem.detail).toMatch(/Idempotency-Key/);
    expect(problem.errors).toEqual([{ path: 'Idempotency-Key', message }]);
    expect(scheduling.appointments.size).toBe(0);
  });

  it.each([
    ['2026-10-05T09:00:00-03:00', 'IN_PAST'],
    ['2026-10-05T09:30:00-03:00', 'TOO_SOON'],
    ['2026-10-11T10:00:00-03:00', 'CLOSED_DATE'],
    ['2026-10-06T10:15:00-03:00', 'MISALIGNED'],
  ])('refuses %s with 422 %s', async (startsAt, code) => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    expect(expectProblem(await book(server, cookie, { startsAt }), 422).code).toBe(code);
  });

  it('answers 409 SLOT_TAKEN for a slot booked by someone else', async () => {
    const { app: server } = await start();
    await book(server, await sessionCookie(server, 'maria@example.com'));
    const response = await book(server, await sessionCookie(server, 'joao@example.com'));
    expect(expectProblem(response, 409).code).toBe('SLOT_TAKEN');
  });

  it('is for clients only: an admin gets 403', async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'admin@example.com');
    expect(expectProblem(await book(server, cookie), 403).code).toBe('FORBIDDEN');
  });

  it('requires a session and the CSRF header', async () => {
    const { app: server } = await start();
    expect(expectProblem(await book(server, ''), 401).code).toBe('UNAUTHENTICATED');
    const cookie = await sessionCookie(server, 'maria@example.com');
    const response = await server.inject({
      method: 'POST',
      url: '/api/appointments',
      payload: { startsAt: TUESDAY_10AM },
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
    });
    expect(expectProblem(response, 403).code).toBe('FORBIDDEN');
  });

  it(`limits each client to ${String(CREATE_REQUESTS_PER_USER_PER_MINUTE)} attempts per minute`, async () => {
    const { app: server } = await start();
    const cookie = await sessionCookie(server, 'maria@example.com');
    const misaligned = { startsAt: '2026-10-06T10:15:00-03:00' };
    for (let i = 0; i < CREATE_REQUESTS_PER_USER_PER_MINUTE; i += 1) {
      expect((await book(server, cookie, misaligned)).statusCode).toBe(422);
    }
    const limited = await book(server, cookie, misaligned);
    expect(expectProblem(limited, 429).code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();

    const other = await sessionCookie(server, 'joao@example.com');
    expect((await book(server, other, misaligned)).statusCode).toBe(422);
  });
});

describe('GET /api/appointments', () => {
  const pageSchema = paginatedSchema(appointmentSchema);

  it('lists only the caller’s appointments', async () => {
    const { app: server } = await start();
    const maria = await sessionCookie(server, 'maria@example.com');
    const joao = await sessionCookie(server, 'joao@example.com');
    await book(server, maria);
    await book(server, joao, { startsAt: '2026-10-06T11:00:00-03:00' });

    const response = await send(server, 'GET', '/api/appointments?scope=upcoming&pageSize=5', {
      headers: { cookie: maria },
    });
    expect(response.statusCode).toBe(200);
    const page = pageSchema.parse(response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 5, total: 1 });
    expect(page.items[0]?.startsAt).toBe('2026-10-06T13:00:00.000Z');

    const past = await send(server, 'GET', '/api/appointments?scope=past', {
      headers: { cookie: maria },
    });
    expect(pageSchema.parse(past.json()).total).toBe(0);
  });

  it('refuses an unknown scope with 422 and admins with 403', async () => {
    const { app: server } = await start();
    const maria = await sessionCookie(server, 'maria@example.com');
    const bad = await send(server, 'GET', '/api/appointments?scope=all', {
      headers: { cookie: maria },
    });
    expect(expectProblem(bad, 422).code).toBe('VALIDATION_FAILED');
    const admin = await sessionCookie(server, 'admin@example.com');
    const forbidden = await send(server, 'GET', '/api/appointments', {
      headers: { cookie: admin },
    });
    expect(expectProblem(forbidden, 403).code).toBe('FORBIDDEN');
  });
});

describe('POST /api/appointments/:id/cancel', () => {
  async function booked() {
    const env = await start();
    const cookie = await sessionCookie(env.app, 'maria@example.com');
    const { id } = appointmentSchema.parse((await book(env.app, cookie)).json());
    return { ...env, cookie, id };
  }

  it('cancels (200), then refuses a second cancel (409) and frees the slot', async () => {
    const { app: server, cookie, id } = await booked();
    const response = await send(server, 'POST', `/api/appointments/${id}/cancel`, {
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(appointmentSchema.parse(response.json())).toMatchObject({ id, status: 'CANCELLED' });

    const again = await send(server, 'POST', `/api/appointments/${id}/cancel`, {
      headers: { cookie },
    });
    expect(expectProblem(again, 409).code).toBe('INVALID_TRANSITION');

    const availability = await send(server, 'GET', '/api/availability?date=2026-10-06', {
      headers: { cookie },
    });
    expect(availabilityResponseSchema.parse(availability.json()).slots).toHaveLength(18);
  });

  it('answers 404 for another client’s appointment and for an unknown id', async () => {
    const { app: server, id } = await booked();
    const joao = await sessionCookie(server, 'joao@example.com');
    for (const target of [id, randomUUID()]) {
      const response = await send(server, 'POST', `/api/appointments/${target}/cancel`, {
        headers: { cookie: joao },
      });
      expect(expectProblem(response, 404).code).toBe('NOT_FOUND');
    }
  });

  it('answers 422 after the deadline and for a malformed id', async () => {
    const { app: server, cookie, id, clock } = await booked();
    const malformed = await send(server, 'POST', '/api/appointments/not-a-uuid/cancel', {
      headers: { cookie },
    });
    expect(expectProblem(malformed, 422).code).toBe('VALIDATION_FAILED');

    clock.set('2026-10-06T12:45:00.000Z');
    const freshCookie = await sessionCookie(server, 'maria@example.com');
    const late = await send(server, 'POST', `/api/appointments/${id}/cancel`, {
      headers: { cookie: freshCookie },
    });
    expect(expectProblem(late, 422).code).toBe('CANCEL_DEADLINE_PASSED');
  });

  it('still requires the CSRF header', async () => {
    const { app: server, cookie, id } = await booked();
    const response = await server.inject({
      method: 'POST',
      url: `/api/appointments/${id}/cancel`,
      headers: { cookie },
    });
    expect(expectProblem(response, 403).code).toBe('FORBIDDEN');
  });
});

describe('CORS', () => {
  it('lets the web app send the Idempotency-Key header and read the replay marker', async () => {
    const { app: server } = await start();
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/appointments',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'idempotency-key',
      },
    });
    expect(response.headers['access-control-allow-headers']).toContain(IDEMPOTENCY_KEY_HEADER);
    const simple = await server.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(simple.headers['access-control-expose-headers']).toContain(IDEMPOTENT_REPLAY_HEADER);
  });
});
