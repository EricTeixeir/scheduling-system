import { randomUUID } from 'node:crypto';

import {
  appointmentSchema,
  paginatedSchema,
  problemDetailsSchema,
  type ErrorCode,
} from '@scheduling/shared';

import { SEED_SLOT_MINUTES, SEED_WEEKLY_HOURS } from '../../apps/api/prisma/seed-schedule';
import { resolveRequestedSlot } from '../../apps/api/src/domain/availability/slots';
import { minuteOfDay } from '../../apps/api/src/domain/availability/weekly-hours';
import { addMinutes } from '../../apps/api/src/domain/time/instant';
import { localDateOf, weekdayOf, zonedInstant } from '../../apps/api/src/domain/time/local-date';
import { problemTitle } from '../../apps/api/src/errors/problem-titles';
import {
  appointmentIdOf,
  book,
  businessTimeZone,
  cancel,
  createClient,
  describeReply,
  freeSlot,
  registerClient,
  restartApiAndDatabase,
  type Client,
  type Reply,
} from './api';

export interface Outcome {
  readonly summary: string;
  readonly failures: readonly string[];
}

export interface Actors {
  readonly racer: Client;
  readonly client: Client;
}

export interface Rule {
  readonly key: string;
  readonly title: string;
  readonly check: (actors: Actors) => Promise<Outcome>;
}

const CONCURRENT_BOOKINGS = 10;
const OVER_THE_BODY_LIMIT = 17 * 1024;
const LEAKED_INTERNALS = /\bat \S+ \(|node_modules|\.(?:ts|js|mjs):\d+/;
const appointmentPageSchema = paginatedSchema(appointmentSchema);

export async function prepareActors(): Promise<Actors> {
  return { racer: await registerClient(), client: await registerClient() };
}

function isProblem(reply: Reply, code: ErrorCode): boolean {
  const problem = problemDetailsSchema.safeParse(reply.body);
  return problem.success && problem.data.code === code && problem.data.title === problemTitle(code);
}

function expectReply(
  failures: string[],
  label: string,
  reply: Reply,
  status: number,
  code?: ErrorCode,
): boolean {
  const ok =
    reply.status === status &&
    (code === undefined || isProblem(reply, code)) &&
    !LEAKED_INTERNALS.test(reply.text);
  if (!ok) {
    failures.push(
      `${label}: expected ${String(status)} ${code ?? ''}, got ${describeReply(reply)}`,
    );
  }
  return ok;
}

async function checkConflict({ racer, client }: Actors): Promise<Outcome> {
  const failures: string[] = [];
  const slot = await freeSlot(racer);
  const replies = await Promise.all(
    Array.from({ length: CONCURRENT_BOOKINGS }, () => book(racer, slot)),
  );
  const winners = replies.filter((reply) => reply.status === 201);
  const losers = replies.filter((reply) => reply.status !== 201);
  const rejected = losers.filter((reply) =>
    expectReply(failures, 'concurrent booking', reply, 409, 'SLOT_TAKEN'),
  ).length;
  const summary = `${String(winners.length)} criado, ${String(rejected)} rejeitados com 409`;
  const [winner] = winners;
  if (winners.length !== 1 || winner === undefined) {
    return { summary, failures: [...failures, `expected exactly 1 booking created`] };
  }

  expectReply(failures, 'booking the taken slot', await book(client, slot), 409, 'SLOT_TAKEN');
  expectReply(failures, 'cancelling the winner', await cancel(racer, appointmentIdOf(winner)), 200);
  const rebooked = await book(client, slot);
  if (expectReply(failures, 're-booking the freed slot', rebooked, 201)) {
    expectReply(failures, 'cleanup', await cancel(client, appointmentIdOf(rebooked)), 200);
  }
  return { summary, failures };
}

function lastOpeningBefore(now: Date, timeZone: string): Date {
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = localDateOf(addMinutes(now, -daysBack * 24 * 60), timeZone);
    const hours = SEED_WEEKLY_HOURS.find(({ weekday }) => weekday === weekdayOf(date));
    if (hours !== undefined) return zonedInstant(date, minuteOfDay(hours.opensAt), timeZone);
  }
  throw new Error('the seeded schedule has no open weekday');
}

function floorToGrid(instant: Date): Date {
  const slotMs = SEED_SLOT_MINUTES * 60_000;
  return new Date(Math.floor(instant.getTime() / slotMs) * slotMs);
}

// The API checks the slot grid before the time window: off hours, a past instant is refused
// with the grid's code (CLOSED_DATE, OUTSIDE_BUSINESS_HOURS) instead of IN_PAST or TOO_SOON.
function expectedRefusal(startsAt: Date, now: Date, timeZone: string): ErrorCode {
  const date = localDateOf(startsAt, timeZone);
  const rule = SEED_WEEKLY_HOURS.find(({ weekday }) => weekday === weekdayOf(date));
  const hours = rule === undefined ? null : { ...rule, slotMinutes: SEED_SLOT_MINUTES };
  const slot = resolveRequestedSlot({ startsAt, hours, isClosedDate: false, timeZone });
  if (!slot.ok) return slot.reason;
  return startsAt <= now ? 'IN_PAST' : 'TOO_SOON';
}

async function checkPast({ client }: Actors): Promise<Outcome> {
  const failures: string[] = [];
  const now = new Date();
  const timeZone = await businessTimeZone(client);
  const pastStarts: [string, Date][] = [
    ['ontem', lastOpeningBefore(now, timeZone)],
    ['uma hora atrás', floorToGrid(addMinutes(now, -60))],
    // The next grid boundary, not the next open slot: off hours that slot can be hours ahead.
    ['começando agora', addMinutes(floorToGrid(now), SEED_SLOT_MINUTES)],
  ];
  let rejected = 0;
  for (const [label, startsAt] of pastStarts) {
    const reply = await book(client, startsAt.toISOString());
    const code = expectedRefusal(startsAt, now, timeZone);
    if (expectReply(failures, `${label} (${startsAt.toISOString()})`, reply, 422, code)) {
      rejected++;
    }
  }

  const future = await book(client, await freeSlot(client));
  if (expectReply(failures, 'free future slot', future, 201)) {
    expectReply(failures, 'cleanup', await cancel(client, appointmentIdOf(future)), 200);
  }
  return { summary: `${String(rejected)} rejeitadas com 422`, failures };
}

async function checkInvalid({ racer, client }: Actors): Promise<Outcome> {
  const failures: string[] = [];
  const slot = await freeSlot(client);
  const ownCancel = `/api/appointments/${appointmentIdOf(await book(client, slot))}/cancel`;
  const cases: [string, number, ErrorCode, () => Promise<Reply>][] = [
    [
      'JSON malformado',
      400,
      'VALIDATION_FAILED',
      () => client.request('POST', '/api/appointments', { body: '{"startsAt":' }),
    ],
    ['campo extra', 422, 'VALIDATION_FAILED', () => book(client, slot, { role: 'ADMIN' })],
    [
      'UUID inválido',
      422,
      'VALIDATION_FAILED',
      () => client.request('POST', '/api/appointments/not-a-uuid/cancel'),
    ],
    ['recurso inexistente', 404, 'NOT_FOUND', () => cancel(client, randomUUID())],
    ['sem login', 401, 'UNAUTHENTICATED', () => createClient().request('GET', '/api/appointments')],
    ['agendamento de outro cliente', 404, 'NOT_FOUND', () => racer.request('POST', ownCancel)],
    [
      'cancelar duas vezes',
      409,
      'INVALID_TRANSITION',
      async () => {
        const first = await client.request('POST', ownCancel);
        return first.status === 200 ? client.request('POST', ownCancel) : first;
      },
    ],
    [
      'corpo acima do limite',
      413,
      'PAYLOAD_TOO_LARGE',
      () => book(client, slot, { notes: 'x'.repeat(OVER_THE_BODY_LIMIT) }),
    ],
  ];
  let handled = 0;
  for (const [label, status, code, send] of cases) {
    if (expectReply(failures, label, await send(), status, code)) handled++;
  }
  return {
    summary: `${String(handled)}/${String(cases.length)} tratadas sem vazar detalhes`,
    failures,
  };
}

async function checkPersistence({ client }: Actors): Promise<Outcome> {
  const failures: string[] = [];
  const created = await book(client, await freeSlot(client));
  if (!expectReply(failures, 'creating the appointment', created, 201)) {
    return { summary: 'não foi possível criar o agendamento', failures };
  }
  const id = appointmentIdOf(created);
  await restartApiAndDatabase();

  const listing = await client.request('GET', '/api/appointments?scope=upcoming&pageSize=50');
  const page = appointmentPageSchema.safeParse(listing.body);
  const status = page.success ? page.data.items.find((item) => item.id === id)?.status : undefined;
  if (status !== 'CONFIRMED') {
    failures.push(`after the restart ${id} is ${status ?? 'missing'}: ${describeReply(listing)}`);
  }
  expectReply(failures, 'cleanup', await cancel(client, id), 200);
  return { summary: 'dados mantidos após restart', failures };
}

export const RULES: readonly Rule[] = [
  { key: 'conflict', title: 'Conflito de horários', check: checkConflict },
  { key: 'past', title: 'Datas e horas passadas', check: checkPast },
  { key: 'invalid', title: 'Operações inválidas', check: checkInvalid },
  // Last: restarting the API resets its in-memory rate limits, leaving a fresh budget for the next run.
  { key: 'persist', title: 'Persistência', check: checkPersistence },
];
