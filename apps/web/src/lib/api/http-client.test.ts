import { userSchema } from '@scheduling/shared';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  CLIENT_USER,
  createFetchMock,
  jsonResponse,
  noContent,
  problemResponse,
} from '@/test/fetch-mock';
import { createTestLogger } from '@/test/test-logger';

import { ApiError } from './api-error';
import { createApiClient } from './http-client';

function setup(routes: Parameters<typeof createFetchMock>[0]) {
  const mock = createFetchMock(routes);
  const onSessionExpired = vi.fn();
  const logger = createTestLogger();
  const api = createApiClient({ fetch: mock.fetch, onSessionExpired, logger });
  return { ...mock, api, onSessionExpired, logger };
}

const unauthenticated = () => problemResponse(401, { code: 'UNAUTHENTICATED' });

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => {
      throw new Error('Expected the request to fail');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('createApiClient', () => {
  describe('request shape', () => {
    it('sends credentials and the CSRF header on POST, with a JSON body under /api', async () => {
      const { api, calls } = setup({ 'POST /auth/login': () => jsonResponse(CLIENT_USER) });

      await api.request('/auth/login', {
        method: 'POST',
        body: { email: 'maria@example.com', password: 'segura123' },
        schema: userSchema,
      });

      const [call] = calls;
      expect(call?.credentials).toBe('include');
      expect(call?.headers.get('X-Requested-With')).toBe('fetch');
      expect(call?.headers.get('Content-Type')).toBe('application/json');
      expect(call?.body).toEqual({ email: 'maria@example.com', password: 'segura123' });
    });

    it.each(['PUT', 'PATCH', 'DELETE'] as const)('sends the CSRF header on %s', async (method) => {
      const { api, calls } = setup({ [`${method} /x`]: () => noContent() });

      await api.request('/x', { method });

      expect(calls[0]?.headers.get('X-Requested-With')).toBe('fetch');
    });

    it('sends credentials but no CSRF header on GET', async () => {
      const { api, calls } = setup({ 'GET /auth/me': () => jsonResponse(CLIENT_USER) });

      const user = await api.request('/auth/me', { schema: userSchema });

      expect(user).toEqual(CLIENT_USER);
      expect(calls[0]?.credentials).toBe('include');
      expect(calls[0]?.headers.has('X-Requested-With')).toBe(false);
      expect(calls[0]?.headers.has('Content-Type')).toBe(false);
    });

    it('sends extra headers without letting them replace the CSRF header', async () => {
      const { api, calls } = setup({ 'POST /appointments': () => noContent() });

      await api.request('/appointments', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'key-1', 'X-Requested-With': 'forged' },
      });

      expect(calls[0]?.headers.get('Idempotency-Key')).toBe('key-1');
      expect(calls[0]?.headers.get('X-Requested-With')).toBe('fetch');
    });

    it('rejects paths that do not start with a slash', async () => {
      const { api } = setup({});

      await expect(api.request('auth/me')).rejects.toThrow('must start with "/"');
    });
  });

  describe('errors', () => {
    it('parses a problem+json body into a typed ApiError', async () => {
      const { api } = setup({
        'POST /appointments': () =>
          problemResponse(422, {
            title: 'Dados inválidos',
            code: 'VALIDATION_FAILED',
            detail: 'Revise os campos destacados.',
            errors: [{ path: 'startsAt', message: 'Data e hora inválidas.' }],
          }),
      });

      const error = await captureError(api.request('/appointments', { method: 'POST', body: {} }));

      expect(error).toMatchObject({
        kind: 'http',
        status: 422,
        code: 'VALIDATION_FAILED',
        title: 'Dados inválidos',
        detail: 'Revise os campos destacados.',
        fieldErrors: [{ path: 'startsAt', message: 'Data e hora inválidas.' }],
      });
    });

    it('falls back to a generic ApiError when the body is not a valid problem', async () => {
      const { api } = setup({
        'GET /x': () => new Response('<html>Bad gateway</html>', { status: 502 }),
      });

      const error = await captureError(api.request('/x'));

      expect(error).toMatchObject({ kind: 'http', status: 502, code: undefined, fieldErrors: [] });
    });

    it('treats a problem body carrying extra fields as not a problem', async () => {
      const { api } = setup({ 'GET /x': () => problemResponse(500, { stack: 'at secret.ts:1' }) });

      const error = await captureError(api.request('/x'));

      expect(error).toMatchObject({ status: 500, code: undefined, detail: undefined });
    });

    it('turns a fetch failure into a network ApiError', async () => {
      const { api } = setup({ 'GET /x': () => Promise.reject(new TypeError('Failed to fetch')) });

      const error = await captureError(api.request('/x'));

      expect(error).toMatchObject({ kind: 'network', status: 0 });
      expect(error.cause).toBeInstanceOf(TypeError);
    });

    it('lets an abort propagate as-is', async () => {
      const controller = new AbortController();
      const abort = new DOMException('Aborted', 'AbortError');
      const { api } = setup({
        'GET /x': () => {
          controller.abort();
          return Promise.reject(abort);
        },
      });

      await expect(api.request('/x', { signal: controller.signal })).rejects.toBe(abort);
    });

    it('rejects and logs a success body that breaks the contract', async () => {
      const { api, logger } = setup({ 'GET /auth/me': () => jsonResponse({ id: 'nope' }) });

      const error = await captureError(api.request('/auth/me', { schema: userSchema }));

      expect(error.kind).toBe('invalid-response');
      expect(logger.error).toHaveBeenCalledWith(
        'Response does not match the contract',
        expect.objectContaining({ path: '/auth/me' }),
      );
    });

    it('rejects a success body that is not JSON', async () => {
      const { api } = setup({ 'GET /x': () => new Response('not json', { status: 200 }) });

      const error = await captureError(api.request('/x', { schema: z.object({}) }));

      expect(error.kind).toBe('invalid-response');
    });
  });

  describe('session refresh on 401', () => {
    it('refreshes once and retries the original request', async () => {
      const { api, callsTo, onSessionExpired } = setup({
        'GET /auth/me': [unauthenticated, () => jsonResponse(CLIENT_USER)],
        'POST /auth/refresh': () => noContent(),
      });

      await expect(api.request('/auth/me', { schema: userSchema })).resolves.toEqual(CLIENT_USER);

      expect(callsTo('POST', '/auth/refresh')).toHaveLength(1);
      expect(callsTo('POST', '/auth/refresh')[0]?.headers.get('X-Requested-With')).toBe('fetch');
      expect(callsTo('GET', '/auth/me')).toHaveLength(2);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('shares a single refresh between concurrent 401s', async () => {
      let releaseRefresh: () => void = () => undefined;
      const refreshGate = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      const { api, callsTo } = setup({
        'GET /a': [unauthenticated, () => jsonResponse({ ok: 'a' })],
        'GET /b': [unauthenticated, () => jsonResponse({ ok: 'b' })],
        'POST /auth/refresh': async () => {
          await refreshGate;
          return noContent();
        },
      });
      const schema = z.object({ ok: z.string() });

      const both = Promise.all([api.request('/a', { schema }), api.request('/b', { schema })]);
      await vi.waitFor(() => {
        expect(callsTo('POST', '/auth/refresh')).toHaveLength(1);
      });
      releaseRefresh();

      await expect(both).resolves.toEqual([{ ok: 'a' }, { ok: 'b' }]);
      expect(callsTo('POST', '/auth/refresh')).toHaveLength(1);
    });

    it('retries without a new refresh when one finished while the request was in flight', async () => {
      let releaseSlow: () => void = () => undefined;
      const slowGate = new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      const { api, callsTo } = setup({
        'GET /fast': [unauthenticated, () => jsonResponse({})],
        'GET /slow': [
          async () => {
            await slowGate;
            return unauthenticated();
          },
          () => jsonResponse({}),
        ],
        'POST /auth/refresh': () => noContent(),
      });

      const slow = api.request('/slow');
      await api.request('/fast');
      releaseSlow();
      await slow;

      expect(callsTo('POST', '/auth/refresh')).toHaveLength(1);
      expect(callsTo('GET', '/slow')).toHaveLength(2);
    });

    it('retries without logging out when the refresh answers REFRESH_RACE', async () => {
      const { api, callsTo, onSessionExpired } = setup({
        'GET /auth/me': [unauthenticated, () => jsonResponse(CLIENT_USER)],
        'POST /auth/refresh': () => problemResponse(401, { code: 'REFRESH_RACE' }),
      });

      await expect(api.request('/auth/me', { schema: userSchema })).resolves.toEqual(CLIENT_USER);

      expect(callsTo('GET', '/auth/me')).toHaveLength(2);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('expires the session when the refresh is rejected', async () => {
      const { api, callsTo, onSessionExpired } = setup({
        'GET /auth/me': unauthenticated,
        'POST /auth/refresh': unauthenticated,
      });

      const error = await captureError(api.request('/auth/me'));

      expect(error.status).toBe(401);
      expect(onSessionExpired).toHaveBeenCalledOnce();
      expect(callsTo('GET', '/auth/me')).toHaveLength(1);
    });

    it('expires the session when the retry is still unauthorized', async () => {
      const { api, onSessionExpired } = setup({
        'GET /auth/me': unauthenticated,
        'POST /auth/refresh': () => noContent(),
      });

      await captureError(api.request('/auth/me'));

      expect(onSessionExpired).toHaveBeenCalledOnce();
    });

    it('keeps the session when the refresh fails for another reason', async () => {
      const { api, onSessionExpired } = setup({
        'GET /x': unauthenticated,
        'POST /auth/refresh': () => problemResponse(503, { code: 'SERVICE_UNAVAILABLE' }),
      });

      const error = await captureError(api.request('/x'));

      expect(error.status).toBe(503);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('keeps the session when the refresh hits a network failure', async () => {
      const { api, onSessionExpired } = setup({
        'GET /x': unauthenticated,
        'POST /auth/refresh': () => Promise.reject(new TypeError('Failed to fetch')),
      });

      const error = await captureError(api.request('/x'));

      expect(error.kind).toBe('network');
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it.each(['/auth/login', '/auth/register', '/auth/logout'])(
      'does not refresh on a 401 from %s',
      async (path) => {
        const { api, callsTo, onSessionExpired } = setup({ [`POST ${path}`]: unauthenticated });

        const error = await captureError(api.request(path, { method: 'POST', body: {} }));

        expect(error.status).toBe(401);
        expect(callsTo('POST', '/auth/refresh')).toHaveLength(0);
        expect(onSessionExpired).not.toHaveBeenCalled();
      },
    );
  });
});
