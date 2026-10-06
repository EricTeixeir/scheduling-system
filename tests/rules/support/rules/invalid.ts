import { randomUUID } from 'node:crypto';

import type { RulesActors } from '../actors';
import { ApiClient, type ApiResponse } from '../http';
import { Findings, type RuleOutcome } from '../outcome';
import { appointmentId } from '../session';

const OVER_THE_BODY_LIMIT = 17 * 1024;

export interface InvalidCase {
  readonly label: string;
  readonly status: number;
  readonly code?: string;
  readonly send: () => Promise<ApiResponse>;
}

export interface InvalidOutcome extends RuleOutcome {
  readonly handled: number;
  readonly total: number;
}

function withIdempotencyKey(): Record<string, string> {
  return { 'Idempotency-Key': randomUUID() };
}

function plusMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

// CANCEL_DEADLINE_PASSED is not reachable over HTTP with the default policy: a booking needs
// 60 minutes of lead time and the cancel window closes 30 minutes before the start, so no
// bookable appointment is ever inside it. apps/api/src/modules/appointments/appointments.routes.test.ts
// ("answers 422 after the deadline") covers it with a controlled clock.
async function invalidCases({
  session,
  client,
  seededClient,
  admin,
}: RulesActors): Promise<InvalidCase[]> {
  const [ownSlot = '', spareSlot = ''] = await session.freeSlots(seededClient, 2);
  const created = await session.book(seededClient, ownSlot);
  const seededClientAppointment = appointmentId(created);
  const appointments = '/api/appointments';
  const cancelSeededClientAppointment = `${appointments}/${seededClientAppointment}/cancel`;

  return [
    {
      label: 'JSON malformado',
      status: 400,
      code: 'VALIDATION_FAILED',
      send: () =>
        client.request('POST', appointments, {
          rawBody: '{"startsAt":',
          headers: withIdempotencyKey(),
        }),
    },
    {
      label: 'campo extra no corpo',
      status: 422,
      code: 'VALIDATION_FAILED',
      send: () =>
        seededClient.request('POST', appointments, {
          json: { startsAt: spareSlot, notes: session.notes, role: 'ADMIN' },
          headers: withIdempotencyKey(),
        }),
    },
    {
      label: 'UUID inválido na rota',
      status: 422,
      code: 'VALIDATION_FAILED',
      send: () => client.request('POST', `${appointments}/not-a-uuid/cancel`),
    },
    {
      label: 'recurso inexistente',
      status: 404,
      code: 'NOT_FOUND',
      send: () => client.request('POST', `${appointments}/${randomUUID()}/cancel`),
    },
    {
      label: 'sem sessão',
      status: 401,
      code: 'UNAUTHENTICATED',
      send: () => new ApiClient().request('GET', appointments),
    },
    {
      label: 'agendamento de outro cliente',
      status: 404,
      code: 'NOT_FOUND',
      send: () => client.request('POST', cancelSeededClientAppointment),
    },
    {
      label: 'transição de status inválida (cancelar duas vezes)',
      status: 409,
      code: 'INVALID_TRANSITION',
      send: async () => {
        const first = await session.cancel(seededClient, seededClientAppointment);
        if (first.status !== 200) return first;
        return seededClient.request('POST', cancelSeededClientAppointment);
      },
    },
    {
      label: 'corpo acima do limite',
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      send: () =>
        client.request('POST', appointments, {
          json: { startsAt: spareSlot, notes: 'x'.repeat(OVER_THE_BODY_LIMIT) },
          headers: withIdempotencyKey(),
        }),
    },
    {
      label: 'sem cabeçalho CSRF',
      status: 403,
      code: 'FORBIDDEN',
      send: () =>
        client.request('POST', appointments, {
          json: { startsAt: spareSlot },
          headers: withIdempotencyKey(),
          csrf: false,
        }),
    },
    {
      label: 'sem Idempotency-Key',
      status: 400,
      code: 'VALIDATION_FAILED',
      send: () => seededClient.request('POST', appointments, { json: { startsAt: spareSlot } }),
    },
    {
      label: 'horário fora da grade',
      status: 422,
      code: 'MISALIGNED',
      send: () => session.book(seededClient, plusMinutes(spareSlot, 10)),
    },
    {
      label: 'administrador tentando agendar como cliente',
      status: 403,
      code: 'FORBIDDEN',
      send: () => session.book(admin, spareSlot),
    },
  ];
}

export async function invalidOperationsAreHandled(actors: RulesActors): Promise<InvalidOutcome> {
  const findings = new Findings();
  const cases = await invalidCases(actors);
  let handled = 0;
  for (const { label, status, code, send } of cases) {
    if (findings.expectStatus(label, await send(), status, code)) handled++;
  }
  return {
    failures: findings.failures,
    summary: `${String(handled)}/${String(cases.length)} tratadas sem vazar detalhes`,
    handled,
    total: cases.length,
  };
}
