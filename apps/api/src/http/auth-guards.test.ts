import { problemDetailsSchema, type User } from '@scheduling/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { currentUser, registerAuthGuards } from './auth-guards';
import { handleError } from './error-handler';

const CLIENT: User = {
  id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  name: 'Maria',
  email: 'maria@example.com',
  role: 'CLIENT',
};
const ADMIN: User = { ...CLIENT, id: '9a4d3f2b-8c1e-4e7b-8c2a-1d5e6f7a8b9c', role: 'ADMIN' };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function start(signedIn: User | undefined): FastifyInstance {
  const server = Fastify();
  server.setErrorHandler(handleError);
  const guards = registerAuthGuards(server, () => Promise.resolve(signedIn));
  server.get('/me', { preHandler: guards.requireAuth }, (request) => currentUser(request));
  server.get('/admin', { preHandler: [guards.requireAuth, guards.requireRole('ADMIN')] }, () => ({
    ok: true,
  }));
  server.get('/role-only', { preHandler: guards.requireRole('ADMIN') }, () => ({ ok: true }));
  server.get('/unguarded', (request) => currentUser(request));
  app = server;
  return server;
}

async function problemCode(server: FastifyInstance, url: string) {
  const response = await server.inject(url);
  return { status: response.statusCode, code: problemDetailsSchema.parse(response.json()).code };
}

describe('requireAuth', () => {
  it('exposes the authenticated user to the handler', async () => {
    const response = await start(CLIENT).inject('/me');
    expect(response.json()).toEqual(CLIENT);
  });

  it('answers 401 UNAUTHENTICATED when authentication fails', async () => {
    expect(await problemCode(start(undefined), '/me')).toEqual({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('requireRole', () => {
  it('answers 403 FORBIDDEN for a CLIENT on an ADMIN route', async () => {
    expect(await problemCode(start(CLIENT), '/admin')).toEqual({ status: 403, code: 'FORBIDDEN' });
  });

  it('lets an ADMIN through', async () => {
    expect((await start(ADMIN).inject('/admin')).json()).toEqual({ ok: true });
  });

  it('fails closed with 401 when used without requireAuth', async () => {
    expect(await problemCode(start(ADMIN), '/role-only')).toEqual({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('currentUser', () => {
  it('is a programming error on a route without requireAuth', async () => {
    const response = await start(CLIENT).inject('/unguarded');
    expect(response.statusCode).toBe(500);
  });
});
