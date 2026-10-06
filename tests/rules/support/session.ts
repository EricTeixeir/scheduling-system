import { randomBytes, randomUUID } from 'node:crypto';

import { localDateOf } from '../../../apps/api/src/domain/time/local-date';
import { newRunId, type Credentials } from './config';
import { ApiClient, describeResponse, type ApiResponse } from './http';

const SLOT_SCAN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_STAYS_BOOKABLE_FOR_MS = 3 * 60 * 60 * 1000;

interface TrackedAppointment {
  readonly client: ApiClient;
  readonly id: string;
}

function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const field: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
  return typeof field === 'string' ? field : undefined;
}

export function appointmentId(response: ApiResponse): string {
  const id = stringField(response.body, 'id');
  if (id === undefined) {
    throw new Error(`expected an appointment in the response, got ${describeResponse(response)}`);
  }
  return id;
}

function slotStarts(body: unknown): string[] {
  const slots: unknown =
    typeof body === 'object' && body !== null
      ? Object.getOwnPropertyDescriptor(body, 'slots')?.value
      : undefined;
  if (!Array.isArray(slots)) return [];
  return slots
    .map((slot) => stringField(slot, 'startsAt'))
    .filter((startsAt): startsAt is string => startsAt !== undefined);
}

export class RulesSession {
  readonly runId = newRunId();
  readonly #tracked = new Map<string, TrackedAppointment>();
  readonly #pickedSlots = new Set<string>();
  #timeZone: string | undefined;

  get notes(): string {
    return this.runId;
  }

  async registerClient(label: string): Promise<ApiClient> {
    const client = new ApiClient();
    const response = await client.request('POST', '/api/auth/register', {
      json: {
        name: `Rules ${label}`,
        email: `${this.runId}-${label}@example.test`,
        password: randomBytes(18).toString('base64url'),
      },
    });
    if (response.status !== 201) {
      throw new Error(`could not register ${label}: ${describeResponse(response)}`);
    }
    return client;
  }

  async login({ email, password }: Credentials): Promise<ApiClient> {
    const client = new ApiClient();
    const response = await client.request('POST', '/api/auth/login', { json: { email, password } });
    if (response.status !== 200) {
      throw new Error(`could not log in as ${email}: ${describeResponse(response)}`);
    }
    return client;
  }

  async book(
    client: ApiClient,
    startsAt: string,
    { idempotencyKey = randomUUID(), retryOnRateLimit = true } = {},
  ): Promise<ApiResponse> {
    const response = await client.request('POST', '/api/appointments', {
      json: { startsAt, notes: this.notes },
      headers: { 'Idempotency-Key': idempotencyKey },
      retryOnRateLimit,
    });
    if (response.status === 201) {
      const id = appointmentId(response);
      this.#tracked.set(id, { client, id });
    }
    return response;
  }

  async cancel(client: ApiClient, id: string): Promise<ApiResponse> {
    const response = await client.request('POST', `/api/appointments/${id}/cancel`);
    if (response.status === 200) this.#tracked.delete(id);
    return response;
  }

  async timeZone(client: ApiClient): Promise<string> {
    if (this.#timeZone === undefined) {
      const today = localDateOf(new Date(), 'UTC');
      const response = await client.request('GET', `/api/availability?date=${today}`);
      const timeZone = stringField(response.body, 'timeZone');
      if (timeZone === undefined) {
        throw new Error(`availability did not return a time zone: ${describeResponse(response)}`);
      }
      this.#timeZone = timeZone;
    }
    return this.#timeZone;
  }

  async freeSlots(client: ApiClient, count: number): Promise<string[]> {
    const timeZone = await this.timeZone(client);
    const earliest = Date.now() + SLOT_STAYS_BOOKABLE_FOR_MS;
    const today = new Date(`${localDateOf(new Date(), timeZone)}T12:00:00Z`);
    const picked: string[] = [];
    for (let offset = 0; offset < SLOT_SCAN_DAYS && picked.length < count; offset++) {
      const date = localDateOf(new Date(today.getTime() + offset * DAY_MS), 'UTC');
      const response = await client.request('GET', `/api/availability?date=${date}`);
      if (response.status !== 200) {
        throw new Error(`availability for ${date} failed: ${describeResponse(response)}`);
      }
      for (const startsAt of slotStarts(response.body)) {
        if (picked.length === count) break;
        if (Date.parse(startsAt) < earliest || this.#pickedSlots.has(startsAt)) continue;
        this.#pickedSlots.add(startsAt);
        picked.push(startsAt);
      }
    }
    if (picked.length < count) {
      throw new Error(`only ${String(picked.length)} of ${String(count)} free slots found`);
    }
    return picked;
  }

  async cancelEverythingCreated(): Promise<string[]> {
    const failures: string[] = [];
    for (const { client, id } of [...this.#tracked.values()]) {
      const response = await this.cancel(client, id);
      if (response.status !== 200) failures.push(`${id}: ${describeResponse(response)}`);
    }
    return failures;
  }
}
