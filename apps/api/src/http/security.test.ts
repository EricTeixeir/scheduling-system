import { problemDetailsSchema } from '@scheduling/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp, type TestAppOptions } from '../test/build-test-app';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './csrf';

let app: FastifyInstance | undefined;

async function start(options: TestAppOptions = {}): Promise<FastifyInstance> {
  app = await buildTestApp(options);
  app.post('/api/test/echo', () => ({ ok: true }));
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('CSRF header', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'refuses %s without the header with 403',
    async (method) => {
      const server = await start();
      server.route({ method, url: '/api/test/write', handler: () => ({ ok: true }) });
      const response = await server.inject({ method, url: '/api/test/write' });
      expect(response.statusCode).toBe(403);
      expect(problemDetailsSchema.parse(response.json()).code).toBe('FORBIDDEN');
    },
  );

  it('refuses a wrong header value', async () => {
    const server = await start();
    const response = await server.inject({
      method: 'POST',
      url: '/api/test/echo',
      headers: { [CSRF_HEADER]: 'XMLHttpRequest' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('lets a request with the header through', async () => {
    const server = await start();
    const response = await server.inject({
      method: 'POST',
      url: '/api/test/echo',
      headers: { [CSRF_HEADER]: CSRF_HEADER_VALUE },
    });
    expect(response.statusCode).toBe(200);
  });

  it('does not require it on safe methods', async () => {
    const server = await start();
    expect((await server.inject('/api/health')).statusCode).toBe(200);
  });
});

describe('CORS', () => {
  it('allows a listed origin with credentials', async () => {
    const server = await start();
    const response = await server.inject({
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives no CORS headers to an unlisted origin', async () => {
    const server = await start();
    const response = await server.inject({
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight that asks for the CSRF header', async () => {
    const server = await start();
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/test/echo',
      headers: {
        origin: 'http://localhost:8080',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-requested-with',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain(CSRF_HEADER);
  });
});

describe('rate limit', () => {
  const client = (ip: string) => ({ url: '/api/health', headers: { 'x-forwarded-for': ip } });

  it('answers 429 problem+json past the limit', async () => {
    const server = await start({ env: { RATE_LIMIT_MAX: '2' } });
    await server.inject('/api/health');
    await server.inject('/api/health');
    const response = await server.inject('/api/health');
    expect(response.statusCode).toBe(429);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(response.headers['retry-after']).toBeDefined();
    expect(problemDetailsSchema.parse(response.json()).code).toBe('RATE_LIMITED');
  });

  it('also limits unknown routes', async () => {
    const server = await start({ env: { RATE_LIMIT_MAX: '1' } });
    await server.inject('/api/nope');
    expect((await server.inject('/api/nope')).statusCode).toBe(429);
  });

  it('counts per client IP when the request comes through a trusted proxy', async () => {
    const server = await start({ env: { RATE_LIMIT_MAX: '1', TRUST_PROXY: 'loopback' } });
    expect((await server.inject(client('203.0.113.1'))).statusCode).toBe(200);
    expect((await server.inject(client('203.0.113.1'))).statusCode).toBe(429);
    expect((await server.inject(client('203.0.113.2'))).statusCode).toBe(200);
  });

  it('ignores X-Forwarded-For from an untrusted peer', async () => {
    const server = await start({ env: { RATE_LIMIT_MAX: '1', TRUST_PROXY: 'none' } });
    expect((await server.inject(client('203.0.113.1'))).statusCode).toBe(200);
    expect((await server.inject(client('203.0.113.2'))).statusCode).toBe(429);
  });
});

describe('security headers', () => {
  it('sends the helmet headers with a deny-all CSP', async () => {
    const server = await start();
    const response = await server.inject('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
