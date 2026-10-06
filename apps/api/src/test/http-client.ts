import { randomUUID } from 'node:crypto';

import { problemDetailsSchema, type ProblemDetails } from '@scheduling/shared';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';

import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../http/csrf';
import { IDEMPOTENCY_KEY_HEADER } from '../http/idempotency-key';
import { ACCESS_TOKEN_COOKIE } from '../modules/auth/auth-cookies';
import { buildTestApp } from './build-test-app';
import { createFakeClock } from './fake-clock';
import { createInMemorySchedulingStore } from './in-memory-appointments';
import { cheapestArgon2idHasher, createInMemoryUserRepository } from './in-memory-auth';

export const TEST_PASSWORD = 'test-password-123';
export const ADMIN_EMAIL = 'admin@example.com';

export async function startTestServer(now = '2026-10-05T12:00:00.000Z') {
  const users = createInMemoryUserRepository();
  const scheduling = createInMemorySchedulingStore();
  const clock = createFakeClock(now);
  const app = await buildTestApp({ users, scheduling, clock });
  await users.insertIfEmailFree({
    name: 'Admin',
    email: ADMIN_EMAIL,
    passwordHash: await cheapestArgon2idHasher.hash(TEST_PASSWORD),
    role: 'ADMIN',
  });
  return { app, users, scheduling, clock };
}

export function send(
  server: FastifyInstance,
  method: 'GET' | 'POST' | 'DELETE',
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

export async function loginOrRegisterClient(
  server: FastifyInstance,
  email: string,
  name = 'Cliente',
): Promise<string> {
  let response = await send(server, 'POST', '/api/auth/login', {
    payload: { email, password: TEST_PASSWORD },
  });
  if (response.statusCode === 401) {
    response = await send(server, 'POST', '/api/auth/register', {
      payload: { name, email, password: TEST_PASSWORD },
    });
  }
  const issued = response.cookies.find((cookie) => cookie.name === ACCESS_TOKEN_COOKIE);
  if (issued === undefined) throw new Error(`could not sign in ${email}`);
  return `${ACCESS_TOKEN_COOKIE}=${issued.value}`;
}

export function book(server: FastifyInstance, cookie: string, startsAt: string) {
  return send(server, 'POST', '/api/appointments', {
    payload: { startsAt },
    headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
  });
}

export function expectProblem(response: LightMyRequestResponse, status: number): ProblemDetails {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
  return problemDetailsSchema.parse(response.json());
}
