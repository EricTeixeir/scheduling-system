import type { User } from '@scheduling/shared';
import { vi } from 'vitest';

export interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly credentials: RequestCredentials | undefined;
  readonly body: unknown;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function problemResponse(
  status: number,
  extra: Readonly<Record<string, unknown>> = {},
): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title: 'Problem', status, instance: '/api/x', ...extra }),
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export const CLIENT_USER: User = {
  id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  name: 'Maria Silva',
  email: 'maria@example.com',
  role: 'CLIENT',
};

export const ADMIN_USER: User = {
  id: '9b2c8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  name: 'Ana Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
};

function parseBody(body: BodyInit | null | undefined): unknown {
  return typeof body === 'string' ? (JSON.parse(body) as unknown) : undefined;
}

export function createFetchMock(routesByMethodAndPath: Record<string, Handler | Handler[]>) {
  const calls: RecordedCall[] = [];
  const handlerQueues = new Map(
    Object.entries(routesByMethodAndPath).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const call: RecordedCall = {
      method,
      path: url.replace(/^\/api/, ''),
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: parseBody(init?.body),
    };
    calls.push(call);
    const queue = handlerQueues.get(`${method} ${call.path}`);
    const handler = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (handler === undefined) {
      return Promise.reject(new Error(`Unexpected request: ${method} ${call.path}`));
    }
    return Promise.resolve(handler(call));
  });

  return {
    fetch: fetchMock as unknown as typeof fetch,
    calls,
    callsTo: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path),
  };
}
