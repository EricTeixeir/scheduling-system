import { randomUUID } from 'node:crypto';

import {
  appointmentSchema,
  availabilityResponseSchema,
  scheduleBlockListSchema,
  scheduleBlockSchema,
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

const TUESDAY = '2026-10-06';
const LUNCH_BLOCK = {
  weekdays: [1, 2, 3, 4, 5],
  startTime: '13:00',
  endTime: '14:00',
  startsOn: '2026-10-05',
  reason: 'Almoço',
};

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function signedIn() {
  const env = await startTestServer();
  app = env.app;
  const admin = await loginOrRegisterClient(env.app, ADMIN_EMAIL);
  const maria = await loginOrRegisterClient(env.app, 'maria@example.com', 'Maria Souza');
  return { ...env, admin, maria };
}

function createBlock(server: FastifyInstance, cookie: string, payload: object) {
  return send(server, 'POST', '/api/admin/blocks', { payload, headers: { cookie } });
}

async function slotStarts(server: FastifyInstance, cookie: string): Promise<string[]> {
  const response = await send(server, 'GET', `/api/availability?date=${TUESDAY}`, {
    headers: { cookie },
  });
  return availabilityResponseSchema.parse(response.json()).slots.map((slot) => slot.startsAt);
}

describe('admin block routes: access', () => {
  it('requires a session (401) and the ADMIN role (403)', async () => {
    const { app: server, maria } = await signedIn();
    const routes = [
      ['GET', '/api/admin/blocks'],
      ['POST', '/api/admin/blocks'],
      ['DELETE', `/api/admin/blocks/${randomUUID()}`],
    ] as const;
    for (const [method, url] of routes) {
      const options = method === 'POST' ? { payload: LUNCH_BLOCK } : {};
      const anonymous = await send(server, method, url, options);
      expect(expectProblem(anonymous, 401).code).toBe('UNAUTHENTICATED');
      const client = await send(server, method, url, { ...options, headers: { cookie: maria } });
      expect(expectProblem(client, 403).code).toBe('FORBIDDEN');
    }
  });
});

describe('schedule blocks over HTTP', () => {
  it('creates a block (201) that hides slots and refuses bookings, until it is deleted', async () => {
    const { app: server, admin, maria } = await signedIn();
    expect(await slotStarts(server, maria)).toHaveLength(18);

    const created = await createBlock(server, admin, LUNCH_BLOCK);
    expect(created.statusCode).toBe(201);
    const block = scheduleBlockSchema.parse(created.json());
    expect(block).toMatchObject({ ...LUNCH_BLOCK, endsOn: null });

    const starts = await slotStarts(server, maria);
    expect(starts).toHaveLength(16);
    expect(starts).not.toContain('2026-10-06T16:00:00.000Z');
    expect(starts).not.toContain('2026-10-06T16:30:00.000Z');

    const refused = await book(server, maria, '2026-10-06T13:30:00-03:00');
    const problem = expectProblem(refused, 409);
    expect(problem).toMatchObject({ code: 'SLOT_BLOCKED', title: 'Horário indisponível' });

    const list = await send(server, 'GET', '/api/admin/blocks', { headers: { cookie: admin } });
    expect(scheduleBlockListSchema.parse(list.json()).items.map((item) => item.id)).toEqual([
      block.id,
    ]);

    const deleted = await send(server, 'DELETE', `/api/admin/blocks/${block.id}`, {
      headers: { cookie: admin },
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    expect(await slotStarts(server, maria)).toHaveLength(18);
    expect((await book(server, maria, '2026-10-06T13:30:00-03:00')).statusCode).toBe(201);
  });

  it('refuses a block over a confirmed appointment (409) and lists the conflict', async () => {
    const { app: server, admin, maria, scheduling } = await signedIn();
    const booked = appointmentSchema.parse(
      (await book(server, maria, '2026-10-07T13:30:00-03:00')).json(),
    );
    const response = await createBlock(server, admin, LUNCH_BLOCK);
    const problem = expectProblem(response, 409);
    expect(problem).toMatchObject({
      code: 'BLOCK_CONFLICT',
      title: 'O bloqueio coincide com agendamentos confirmados',
      conflicts: [
        {
          appointmentId: booked.id,
          startsAt: '2026-10-07T16:30:00.000Z',
          endsAt: '2026-10-07T17:00:00.000Z',
          clientName: 'Maria Souza',
        },
      ],
    });
    expect(scheduling.blocks.size).toBe(0);
  });

  it('deletes idempotently: an unknown block also answers 204', async () => {
    const { app: server, admin } = await signedIn();
    const response = await send(server, 'DELETE', `/api/admin/blocks/${randomUUID()}`, {
      headers: { cookie: admin },
    });
    expect(response.statusCode).toBe(204);
  });

  it('refuses an invalid block with 422 and the field path', async () => {
    const { app: server, admin } = await signedIn();
    const response = await createBlock(server, admin, { ...LUNCH_BLOCK, endTime: '12:00' });
    const problem = expectProblem(response, 422);
    expect(problem.errors).toEqual([
      { path: 'endTime', message: 'O horário final deve ser posterior ao inicial.' },
    ]);
  });

  it('refuses a malformed id on delete (422) and a missing CSRF header (403)', async () => {
    const { app: server, admin } = await signedIn();
    const malformed = await send(server, 'DELETE', '/api/admin/blocks/abc', {
      headers: { cookie: admin },
    });
    expect(expectProblem(malformed, 422).code).toBe('VALIDATION_FAILED');
    const noCsrf = await server.inject({
      method: 'DELETE',
      url: `/api/admin/blocks/${randomUUID()}`,
      headers: { cookie: admin },
    });
    expect(expectProblem(noCsrf, 403).code).toBe('FORBIDDEN');
  });
});
