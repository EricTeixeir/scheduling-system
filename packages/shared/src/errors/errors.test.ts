import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from './error-codes';
import { MAX_LISTED_CONFLICTS, problemDetailsSchema } from './problem-details';

describe('ERROR_CODES', () => {
  it('has no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});

describe('problemDetailsSchema', () => {
  const minimal = { type: 'about:blank', title: 'Not Found', status: 404 };

  it('accepts the minimal RFC 9457 body', () => {
    expect(problemDetailsSchema.parse(minimal)).toEqual(minimal);
  });

  it('accepts the extensions code and errors', () => {
    const body = {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      detail: 'O corpo da requisição é inválido.',
      instance: '/appointments',
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'email', message: 'E-mail inválido.' }],
    };
    expect(problemDetailsSchema.parse(body)).toEqual(body);
  });

  const conflict = {
    appointmentId: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
    startsAt: '2026-10-07T16:00:00.000Z',
    endsAt: '2026-10-07T16:30:00.000Z',
    clientName: 'Maria',
  };

  it('accepts the conflicts extension of BLOCK_CONFLICT', () => {
    const body = { ...minimal, status: 409, code: 'BLOCK_CONFLICT', conflicts: [conflict] };
    expect(problemDetailsSchema.parse(body)).toEqual(body);
  });

  it(`caps conflicts at ${String(MAX_LISTED_CONFLICTS)}`, () => {
    const conflicts = Array.from({ length: MAX_LISTED_CONFLICTS + 1 }, () => conflict);
    expect(problemDetailsSchema.safeParse({ ...minimal, conflicts }).success).toBe(false);
  });

  it.each([
    { conflicts: [{ ...conflict, clientEmail: 'maria@example.com' }] },
    { conflicts: [{ ...conflict, appointmentId: 'x' }] },
    { conflicts: [{ ...conflict, startsAt: '2026-10-07T16:00:00' }] },
    { conflicts: [{ appointmentId: conflict.appointmentId }] },
    { code: 'SOMETHING_ELSE' },
    { status: 200 },
    { status: 404.5 },
    { status: '404' },
    { errors: [{ path: 'email' }] },
    { errors: [{ path: 'email', message: 'x', stack: 'at ...' }] },
    { stack: 'Error: at ...' },
  ])('rejects %j', (override) => {
    expect(problemDetailsSchema.safeParse({ ...minimal, ...override }).success).toBe(false);
  });
});
