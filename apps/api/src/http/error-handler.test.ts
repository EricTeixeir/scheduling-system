import { createAppointmentSchema, problemDetailsSchema } from '@scheduling/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  ServiceUnavailableError,
  UnauthenticatedError,
  ValidationError,
} from '../errors/app-errors';
import { buildTestApp } from '../test/build-test-app';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './csrf';
import { parseInput } from './parse-input';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_MESSAGE = 'connection to 10.0.0.7 failed for user admin';
const BODY_LIMIT_BYTES = 2048;

let app: FastifyInstance;
let thrown: unknown;

beforeEach(async () => {
  app = await buildTestApp({ env: { BODY_LIMIT_BYTES: String(BODY_LIMIT_BYTES) } });
  app.get('/api/test/throw', () => {
    throw thrown;
  });
  app.post('/api/test/appointments', (request) =>
    parseInput(createAppointmentSchema, request.body),
  );
});

afterEach(async () => {
  await app.close();
});

function expectProblem(response: LightMyRequestResponse, status: number) {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toBe('application/problem+json; charset=utf-8');
  const body = problemDetailsSchema.parse(response.json());
  expect(body.status).toBe(status);
  expect(body.instance).toBe(`urn:uuid:${String(response.headers['x-request-id'])}`);
  return body;
}

function post(payload: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/test/appointments',
    headers: { 'content-type': 'application/json', [CSRF_HEADER]: CSRF_HEADER_VALUE, ...headers },
    payload,
  });
}

describe('AppError responses', () => {
  it.each([
    [
      new ValidationError([{ path: 'email', message: 'E-mail inválido.' }]),
      422,
      'VALIDATION_FAILED',
    ],
    [new UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new ForbiddenError('ACTOR_NOT_ALLOWED'), 403, 'ACTOR_NOT_ALLOWED'],
    [new NotFoundError(), 404, 'NOT_FOUND'],
    [new ConflictError('SLOT_TAKEN'), 409, 'SLOT_TAKEN'],
    [new ConflictError('INVALID_TRANSITION'), 409, 'INVALID_TRANSITION'],
    [new BusinessRuleError('TOO_SOON'), 422, 'TOO_SOON'],
    [new BusinessRuleError('CANCEL_DEADLINE_PASSED'), 422, 'CANCEL_DEADLINE_PASSED'],
    [new PayloadTooLargeError(), 413, 'PAYLOAD_TOO_LARGE'],
    [new RateLimitedError(), 429, 'RATE_LIMITED'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE'],
  ] as const)('%s -> %i %s', async (error, status, code) => {
    thrown = error;
    const body = expectProblem(await app.inject('/api/test/throw'), status);
    expect(body).toMatchObject({
      code,
      title: error.title,
      type: `urn:scheduling:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    });
  });

  it('carries detail and field errors', async () => {
    thrown = new ValidationError([{ path: 'startsAt', message: 'Data inválida.' }], 'Confira.');
    const body = expectProblem(await app.inject('/api/test/throw'), 422);
    expect(body.detail).toBe('Confira.');
    expect(body.errors).toEqual([{ path: 'startsAt', message: 'Data inválida.' }]);
  });
});

describe('unknown errors', () => {
  it.each([
    ['an Error', new Error(SECRET_MESSAGE)],
    ['a string', SECRET_MESSAGE],
    ['an error with a status code', Object.assign(new Error(SECRET_MESSAGE), { statusCode: 418 })],
  ])('answer %s with a generic 500 that leaks nothing', async (_label, error) => {
    thrown = error;
    const response = await app.inject('/api/test/throw');
    const body = expectProblem(response, 500);
    expect(body).toMatchObject({ code: 'INTERNAL', title: 'Erro interno' });
    expect(response.body).not.toContain(SECRET_MESSAGE);
    expect(response.body).not.toMatch(/\bat \S+ \(/);
    expect(response.body).not.toContain('node_modules');
  });
});

describe('request validation', () => {
  it('passes parsed input through', async () => {
    const response = await post(JSON.stringify({ startsAt: '2026-10-07T13:00:00.000Z' }));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ startsAt: '2026-10-07T13:00:00.000Z' });
  });

  it('answers 422 with a pt-BR message per field', async () => {
    const response = await post(JSON.stringify({ notes: 42, extra: true }));
    const body = expectProblem(response, 422);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors?.map((error) => error.path).sort()).toEqual(['', 'notes', 'startsAt']);
    expect(body.errors?.find((error) => error.path === 'notes')?.message).toBe(
      'As observações devem ser um texto.',
    );
    expect(body.errors?.find((error) => error.path === '')?.message).toMatch(/extra/);
    expect(body.errors?.find((error) => error.path === '')?.message).not.toMatch(/unrecognized/i);
  });
});

describe('framework errors', () => {
  it('answers malformed JSON with 400', async () => {
    const body = expectProblem(await post('{"startsAt":'), 400);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('answers an empty JSON body with 400', async () => {
    expectProblem(await post(''), 400);
  });

  it('rejects prototype poisoning as malformed JSON', async () => {
    expectProblem(await post('{"__proto__":{"admin":true}}'), 400);
  });

  it('answers an unsupported content type with 415', async () => {
    const body = expectProblem(await post('startsAt=x', { 'content-type': 'text/plain' }), 415);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('answers a body over the limit with 413', async () => {
    const payload = JSON.stringify({ notes: 'x'.repeat(BODY_LIMIT_BYTES) });
    const body = expectProblem(await post(payload), 413);
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('answers an unknown route with a 404 problem', async () => {
    const body = expectProblem(await app.inject('/api/nope'), 404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('answers a malformed URL with a 400 problem', async () => {
    expectProblem(await app.inject('/api/test/%E0%A4%A'), 400);
  });
});

describe('request id', () => {
  it('generates a UUID per request and echoes it', async () => {
    const first = await app.inject('/api/health');
    const second = await app.inject('/api/health');
    expect(first.headers['x-request-id']).toMatch(UUID);
    expect(second.headers['x-request-id']).toMatch(UUID);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('ignores an id chosen by the client', async () => {
    const forged = '00000000-0000-4000-8000-000000000000';
    const response = await app.inject({ url: '/api/health', headers: { 'x-request-id': forged } });
    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(response.headers['x-request-id']).not.toBe(forged);
  });
});

describe('AppError', () => {
  it('uses the detail as message and the code title otherwise', () => {
    expect(new NotFoundError('Sem agendamento.').message).toBe('Sem agendamento.');
    expect(new AppError(400, 'VALIDATION_FAILED').message).toBe('Dados inválidos');
  });
});
