import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { appointmentSchema, availabilityResponseSchema } from '@scheduling/shared';

export const BASE_URL = new URL(process.env.RULES_BASE_URL ?? 'http://localhost:8080').origin;

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REQUEST_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 120_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_SEARCH_DAYS = 30;

export interface Reply {
  readonly status: number;
  readonly text: string;
  readonly body: unknown;
}

export interface RequestInit {
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface Client {
  request(method: string, path: string, init?: RequestInit): Promise<Reply>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function describeReply(reply: Reply): string {
  return `${String(reply.status)} ${reply.text.slice(0, 200)}`;
}

// A plain cookie jar is enough: only browsers enforce the Secure flag over http://localhost.
export function createClient(): Client {
  const cookies = new Map<string, string>();
  return {
    async request(method, path, { body, headers } = {}) {
      const response = await fetch(new URL(path, BASE_URL), {
        method,
        headers: {
          'X-Requested-With': 'fetch',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
          ...headers,
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      for (const line of response.headers.getSetCookie()) {
        const [, name, value] = /^([^=;]+)=([^;]*)/.exec(line) ?? [];
        if (name !== undefined && value !== undefined) cookies.set(name.trim(), value);
      }
      const text = await response.text();
      return { status: response.status, text, body: parseJson(text) };
    },
  };
}

export async function registerClient(): Promise<Client> {
  const client = createClient();
  const reply = await client.request('POST', '/api/auth/register', {
    body: JSON.stringify({
      name: 'Cliente de teste',
      email: `rules-${randomUUID()}@example.test`,
      password: randomBytes(18).toString('base64url'),
    }),
  });
  if (reply.status !== 201) throw new Error(`could not register a client: ${describeReply(reply)}`);
  return client;
}

export function book(client: Client, startsAt: string, extraFields = {}): Promise<Reply> {
  return client.request('POST', '/api/appointments', {
    body: JSON.stringify({ startsAt, ...extraFields }),
    headers: { 'Idempotency-Key': randomUUID() },
  });
}

export function cancel(client: Client, id: string): Promise<Reply> {
  return client.request('POST', `/api/appointments/${id}/cancel`);
}

export function appointmentIdOf(reply: Reply): string {
  const appointment = appointmentSchema.safeParse(reply.body);
  if (!appointment.success) throw new Error(`expected an appointment, got ${describeReply(reply)}`);
  return appointment.data.id;
}

async function availabilityOn(client: Client, date: string) {
  const reply = await client.request('GET', `/api/availability?date=${date}`);
  const availability = availabilityResponseSchema.safeParse(reply.body);
  if (!availability.success) {
    throw new Error(`availability for ${date} failed: ${describeReply(reply)}`);
  }
  return availability.data;
}

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export async function businessTimeZone(client: Client): Promise<string> {
  return (await availabilityOn(client, utcDate(0))).timeZone;
}

export async function freeSlot(client: Client): Promise<string> {
  for (let day = 0; day < SLOT_SEARCH_DAYS; day++) {
    const [slot] = (await availabilityOn(client, utcDate(day))).slots;
    if (slot !== undefined) return slot.startsAt;
  }
  throw new Error(`no free slot in the next ${String(SLOT_SEARCH_DAYS)} days`);
}

async function isReady(): Promise<boolean> {
  try {
    return (await createClient().request('GET', '/api/health/ready')).status === 200;
  } catch {
    return false;
  }
}

// `docker compose restart` returns before the containers are healthy again, so poll readiness.
export async function restartApiAndDatabase(): Promise<void> {
  const restart = spawnSync('docker', ['compose', 'restart', 'db', 'api'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: READY_TIMEOUT_MS,
    windowsHide: true,
  });
  if (restart.status !== 0) {
    throw new Error(`docker compose restart failed: ${restart.stderr || String(restart.error)}`);
  }
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!(await isReady())) {
    if (Date.now() > deadline) throw new Error('the API was not ready again after the restart');
    await sleep(1_000);
  }
}
