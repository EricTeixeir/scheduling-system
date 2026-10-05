import { problemDetailsSchema } from '@scheduling/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../infra/db/prisma-client';
import { buildTestApp } from '../test/build-test-app';
import { READY_TIMEOUT_MS } from './health';

afterEach(() => {
  vi.useRealTimers();
});

async function ready(prisma: DatabaseClient) {
  const app = await buildTestApp({ prisma });
  try {
    return await app.inject('/api/health/ready');
  } finally {
    await app.close();
  }
}

describe('GET /api/health', () => {
  it('reports liveness without touching the database', async () => {
    const queryRaw = vi.fn();
    const app = await buildTestApp({ prisma: { $queryRaw: queryRaw } });
    const response = await app.inject('/api/health');
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('GET /api/health/ready', () => {
  it('is ok when the database answers SELECT 1', async () => {
    const queryRaw = vi.fn<DatabaseClient['$queryRaw']>(() => Promise.resolve([{ '?column?': 1 }]));
    const response = await ready({ $queryRaw: queryRaw });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(queryRaw.mock.calls[0]?.[0]).toEqual(['SELECT 1']);
  });

  it('answers 503 problem+json when the database is down', async () => {
    const response = await ready({
      $queryRaw: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.7:5432')),
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
    expect(problemDetailsSchema.parse(response.json()).code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toContain('ECONNREFUSED');
  });

  it('answers 503 when the database does not answer in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const app = await buildTestApp({ prisma: { $queryRaw: () => new Promise(() => undefined) } });
    const pending = app.inject('/api/health/ready');
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    const response = await pending;
    await app.close();
    expect(response.statusCode).toBe(503);
  });
});
