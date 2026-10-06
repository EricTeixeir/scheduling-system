import { Writable } from 'node:stream';

import { problemDetailsSchema, userSchema, type ProblemDetails } from '@scheduling/shared';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { CSRF_HEADER, CSRF_HEADER_VALUE } from '../../http/csrf';
import { createLogger } from '../../logging/logger';
import { buildTestApp, type TestAppOptions } from '../../test/build-test-app';
import { createFakeClock } from '../../test/fake-clock';
import {
  createInMemoryRefreshTokenRepository,
  createInMemoryUserRepository,
} from '../../test/in-memory-auth';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth-cookies';
import { LOGIN_ATTEMPTS_PER_EMAIL_PER_MINUTE } from './auth.routes';
import { REFRESH_REUSE_GRACE_SECONDS } from './auth.service';

const TEST_PASSWORD = 'test-password-123';
const MARIA = { name: 'Maria Silva', email: 'maria@example.com', password: TEST_PASSWORD };

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(options: TestAppOptions = {}) {
  const users = options.users ?? createInMemoryUserRepository();
  const refreshTokens = options.refreshTokens ?? createInMemoryRefreshTokenRepository();
  const clock = createFakeClock();
  app = await buildTestApp({ clock, ...options, users, refreshTokens });
  return { app, users, refreshTokens, clock };
}

function post(server: FastifyInstance, url: string, options: Partial<InjectOptions> = {}) {
  return server.inject({
    method: 'POST',
    url,
    ...options,
    headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE, ...options.headers },
  });
}

function register(server: FastifyInstance, body: object = MARIA) {
  return post(server, '/api/auth/register', { payload: body });
}

function login(server: FastifyInstance, email = MARIA.email, password = TEST_PASSWORD) {
  return post(server, '/api/auth/login', { payload: { email, password } });
}

function setCookieHeaders(response: LightMyRequestResponse): string[] {
  const header = response.headers['set-cookie'];
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

function cookieValue(response: LightMyRequestResponse, name: string): string {
  const found = response.cookies.find((cookie) => cookie.name === name);
  if (found === undefined) throw new Error(`no ${name} cookie in the response`);
  return found.value;
}

function sessionCookies(response: LightMyRequestResponse) {
  return {
    access_token: cookieValue(response, ACCESS_TOKEN_COOKIE),
    refresh_token: cookieValue(response, REFRESH_TOKEN_COOKIE),
  };
}

function expectProblem(response: LightMyRequestResponse, status: number): ProblemDetails {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
  return problemDetailsSchema.parse(response.json());
}

function expectClearedCookies(response: LightMyRequestResponse): void {
  const headers = setCookieHeaders(response);
  expect(headers).toHaveLength(2);
  expect(headers.find((h) => h.startsWith(`${ACCESS_TOKEN_COOKIE}=;`))).toMatch(/Path=\/api;/);
  expect(headers.find((h) => h.startsWith(`${REFRESH_TOKEN_COOKIE}=;`))).toMatch(
    /Path=\/api\/auth;/,
  );
  for (const header of headers) {
    expect(header).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  }
}

describe('POST /api/auth/register', () => {
  it('creates a CLIENT, answers 201 with the user DTO and sets the session cookies', async () => {
    const { app: server, users } = await start();
    const response = await register(server);
    expect(response.statusCode).toBe(201);
    const body = userSchema.parse(response.json());
    expect(response.json()).toEqual({ ...body });
    expect(Object.keys(response.json<object>()).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(body).toMatchObject({ name: 'Maria Silva', email: MARIA.email, role: 'CLIENT' });
    expect(users.byEmail(MARIA.email)?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('sets the cookies with exactly the specified attributes', async () => {
    const { app: server } = await start();
    const headers = setCookieHeaders(await register(server));
    expect(headers).toHaveLength(2);
    const access = headers.find((h) => h.startsWith(`${ACCESS_TOKEN_COOKIE}=`)) ?? '';
    const refresh = headers.find((h) => h.startsWith(`${REFRESH_TOKEN_COOKIE}=`)) ?? '';
    expect(access).toMatch(
      /^access_token=[\w-]+\.[\w-]+\.[\w-]+; Max-Age=1800; Path=\/api; HttpOnly; Secure; SameSite=Strict$/,
    );
    expect(refresh).toMatch(
      /^refresh_token=[\w-]{43}; Max-Age=604800; Path=\/api\/auth; HttpOnly; Secure; SameSite=Strict$/,
    );
  });

  it('answers 409 CONFLICT for an email already registered', async () => {
    const { app: server } = await start();
    await register(server);
    const body = expectProblem(
      await register(server, { ...MARIA, email: ' MARIA@example.com ' }),
      409,
    );
    expect(body).toMatchObject({ code: 'CONFLICT', detail: 'Este e-mail já está cadastrado.' });
  });

  it('refuses a self-assigned role with 422', async () => {
    const { app: server } = await start();
    const body = expectProblem(await register(server, { ...MARIA, role: 'ADMIN' }), 422);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('still requires the CSRF header', async () => {
    const { app: server } = await start();
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: MARIA,
    });
    expect(expectProblem(response, 403).code).toBe('FORBIDDEN');
  });
});

describe('POST /api/auth/login', () => {
  it('answers 200 with the user DTO and the session cookies', async () => {
    const { app: server } = await start();
    await register(server);
    const response = await login(server);
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json<object>()).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(sessionCookies(response).refresh_token).toMatch(/^[\w-]{43}$/);
  });

  it.each([
    ['a wrong password', MARIA.email, 'test-wrong-password'],
    ['an unknown email', 'ghost@example.com', TEST_PASSWORD],
  ])('answers the same 401 for %s and sets no cookie', async (_label, email, password) => {
    const { app: server } = await start();
    await register(server);
    const response = await login(server, email, password);
    const body = expectProblem(response, 401);
    expect(body).toMatchObject({ code: 'UNAUTHENTICATED', detail: 'E-mail ou senha inválidos.' });
    expect(setCookieHeaders(response)).toEqual([]);
  });

  it('answers the same 401 for a locked account with the right password', async () => {
    const { app: server, users } = await start();
    await register(server);
    const row = users.byEmail(MARIA.email);
    if (row !== undefined) row.lockedUntil = new Date('2026-10-05T12:10:00.000Z');
    const body = expectProblem(await login(server), 401);
    expect(body).toMatchObject({ code: 'UNAUTHENTICATED', detail: 'E-mail ou senha inválidos.' });
  });

  it('refuses a request without the CSRF header', async () => {
    const { app: server } = await start();
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: MARIA.email, password: TEST_PASSWORD },
    });
    expect(expectProblem(response, 403).code).toBe('FORBIDDEN');
  });

  it('answers 429 after 5 attempts per email and IP within a minute', async () => {
    const { app: server } = await start();
    expect(LOGIN_ATTEMPTS_PER_EMAIL_PER_MINUTE).toBe(5);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(server, MARIA.email, 'test-wrong-password')).statusCode).toBe(401);
    }
    const limited = await login(server, ' Maria@Example.com', 'test-wrong-password');
    expect(expectProblem(limited, 429).code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect((await login(server, 'other@example.com', 'test-wrong-password')).statusCode).toBe(401);
  });

  it('answers 422 for an invalid body', async () => {
    const { app: server } = await start();
    const response = await post(server, '/api/auth/login', { payload: { email: 'x' } });
    expect(expectProblem(response, 422).code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/auth/me', () => {
  it('answers 401 without the access cookie', async () => {
    const { app: server } = await start();
    const body = expectProblem(await server.inject('/api/auth/me'), 401);
    expect(body.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user with the access cookie', async () => {
    const { app: server } = await start();
    const registered = await register(server);
    const response = await server.inject({
      url: '/api/auth/me',
      cookies: sessionCookies(registered),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(registered.json());
  });

  it('answers 401 for a tampered access token', async () => {
    const { app: server } = await start();
    const access = sessionCookies(await register(server)).access_token;
    const [header, payload, signature] = access.split('.');
    const tampered = `${String(header)}.${String(payload)}x.${String(signature)}`;
    const response = await server.inject({
      url: '/api/auth/me',
      cookies: { [ACCESS_TOKEN_COOKIE]: tampered },
    });
    expect(expectProblem(response, 401).code).toBe('UNAUTHENTICATED');
  });

  it('answers 401 once the access token expired', async () => {
    const { app: server, clock } = await start();
    const cookies = sessionCookies(await register(server));
    clock.advanceMinutes(30);
    const response = await server.inject({ url: '/api/auth/me', cookies });
    expect(response.statusCode).toBe(401);
  });

  it('answers 401 for a deleted user', async () => {
    const { app: server, users } = await start();
    const registered = await register(server);
    users.rows.clear();
    const response = await server.inject({
      url: '/api/auth/me',
      cookies: sessionCookies(registered),
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('answers 204 and rotates both cookies', async () => {
    const { app: server } = await start();
    const first = sessionCookies(await register(server));
    const response = await post(server, '/api/auth/refresh', { cookies: first });
    expect(response.statusCode).toBe(204);
    const second = sessionCookies(response);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    const refreshHeader = setCookieHeaders(response).find((h) => h.startsWith('refresh_token='));
    expect(refreshHeader).toMatch(
      /Max-Age=604800; Path=\/api\/auth; HttpOnly; Secure; SameSite=Strict$/,
    );
  });

  it('shrinks the refresh cookie Max-Age toward the fixed family expiry', async () => {
    const { app: server, clock } = await start();
    const first = sessionCookies(await register(server));
    clock.advanceMinutes(60);
    const response = await post(server, '/api/auth/refresh', { cookies: first });
    const refreshHeader = setCookieHeaders(response).find((h) => h.startsWith('refresh_token='));
    expect(refreshHeader).toMatch(/Max-Age=601200;/);
  });

  it('answers REFRESH_RACE without clearing cookies to a second refresh within the window', async () => {
    const { app: server, refreshTokens, clock } = await start();
    const first = sessionCookies(await register(server));
    const winner = sessionCookies(await post(server, '/api/auth/refresh', { cookies: first }));
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS);

    const loser = await post(server, '/api/auth/refresh', { cookies: first });
    expect(expectProblem(loser, 401).code).toBe('REFRESH_RACE');
    expect(setCookieHeaders(loser)).toEqual([]);
    expect([...refreshTokens.families.values()][0]?.revokedAt).toBeNull();

    const retried = await server.inject({ url: '/api/auth/me', cookies: winner });
    expect(retried.statusCode).toBe(200);
    expect((await post(server, '/api/auth/refresh', { cookies: winner })).statusCode).toBe(204);
  });

  it('answers 401, clears the cookies and revokes the family when an old token is replayed after the window', async () => {
    const { app: server, refreshTokens, clock } = await start();
    const first = sessionCookies(await register(server));
    const second = sessionCookies(await post(server, '/api/auth/refresh', { cookies: first }));
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS + 1);

    const replay = await post(server, '/api/auth/refresh', { cookies: first });
    expect(expectProblem(replay, 401).code).toBe('UNAUTHENTICATED');
    expectClearedCookies(replay);
    expect([...refreshTokens.families.values()][0]?.revokedAt).not.toBeNull();

    const afterReuse = await post(server, '/api/auth/refresh', { cookies: second });
    expect(afterReuse.statusCode).toBe(401);
  });

  it.each([
    ['no cookie', {}],
    ['an unknown token', { [REFRESH_TOKEN_COOKIE]: 'A'.repeat(43) }],
    ['a malformed token', { [REFRESH_TOKEN_COOKIE]: 'nope' }],
  ])('answers 401 and clears the cookies for %s', async (_label, cookies) => {
    const { app: server } = await start();
    const response = await post(server, '/api/auth/refresh', { cookies });
    expect(expectProblem(response, 401).code).toBe('UNAUTHENTICATED');
    expectClearedCookies(response);
  });

  it('answers 401 once the family expired', async () => {
    const { app: server, clock } = await start();
    const cookies = sessionCookies(await register(server));
    clock.advanceMinutes(7 * 24 * 60);
    expect((await post(server, '/api/auth/refresh', { cookies })).statusCode).toBe(401);
  });

  it('requires the CSRF header', async () => {
    const { app: server } = await start();
    const cookies = sessionCookies(await register(server));
    const response = await server.inject({ method: 'POST', url: '/api/auth/refresh', cookies });
    expect(response.statusCode).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('gives no grace to a token revoked by logout moments ago', async () => {
    const { app: server } = await start();
    const cookies = sessionCookies(await register(server));
    await post(server, '/api/auth/logout', { cookies });
    const response = await post(server, '/api/auth/refresh', { cookies });
    expect(expectProblem(response, 401).code).toBe('UNAUTHENTICATED');
    expectClearedCookies(response);
  });

  it('answers 204, clears the cookies and revokes the family', async () => {
    const { app: server, refreshTokens } = await start();
    const cookies = sessionCookies(await register(server));
    const response = await post(server, '/api/auth/logout', { cookies });
    expect(response.statusCode).toBe(204);
    expectClearedCookies(response);
    expect([...refreshTokens.families.values()][0]?.revokedAt).not.toBeNull();
    expect((await post(server, '/api/auth/refresh', { cookies })).statusCode).toBe(401);
  });

  it('answers 204 without any cookie', async () => {
    const { app: server } = await start();
    const response = await post(server, '/api/auth/logout');
    expect(response.statusCode).toBe(204);
    expectClearedCookies(response);
  });
});

describe('logging', () => {
  it('never writes passwords or token values', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const { app: server, clock } = await start({ logger: createLogger('trace', stream) });

    const registered = await register(server);
    const first = sessionCookies(registered);
    await login(server, MARIA.email, 'test-wrong-password-456');
    const loggedIn = sessionCookies(await login(server));
    const refreshed = sessionCookies(await post(server, '/api/auth/refresh', { cookies: first }));
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS + 1);
    await post(server, '/api/auth/refresh', { cookies: first });
    await server.inject({ url: '/api/auth/me', cookies: loggedIn });
    await post(server, '/api/auth/logout', { cookies: refreshed });

    const output = lines.join('\n');
    expect(lines.length).toBeGreaterThan(10);
    expect(output).toContain('refresh token reuse detected');
    const secrets = [
      TEST_PASSWORD,
      'test-wrong-password-456',
      ...Object.values(first),
      ...Object.values(loggedIn),
      ...Object.values(refreshed),
    ];
    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
  });
});
