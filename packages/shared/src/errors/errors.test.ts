import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from './error-codes';
import { problemDetailsSchema } from './problem-details';

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

  it.each([
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
