import { describe, expect, it } from 'vitest';

import { AppError, ConflictError, NotFoundError } from '../../errors/app-errors';
import { Prisma } from './generated/client.js';
import { isUniqueViolation, mapPrismaError } from './prisma-errors';

const LEAKY_MESSAGE = 'Failing row contains (ana@example.com, $argon2id$secret-hash)';

function knownError(code: string, originalCode?: string) {
  const meta =
    originalCode === undefined
      ? undefined
      : {
          modelName: 'Appointment',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: { originalCode, originalMessage: LEAKY_MESSAGE, kind: 'postgres' },
            stack: 'DriverAdapterError: at PrismaPgAdapter.query (adapter-pg/dist/index.mjs:1:1)',
          },
        };
  return new Prisma.PrismaClientKnownRequestError(LEAKY_MESSAGE, {
    code,
    clientVersion: '7.10.0',
    ...(meta === undefined ? {} : { meta }),
  });
}

function expectAppError(mapped: unknown, status: number, code: string): AppError {
  expect(mapped).toBeInstanceOf(AppError);
  const error = mapped as AppError;
  expect(error.status).toBe(status);
  expect(error.code).toBe(code);
  expect(JSON.stringify(error)).not.toContain('driverAdapterError');
  expect(error.message).not.toContain(LEAKY_MESSAGE);
  return error;
}

describe('mapPrismaError', () => {
  it('maps an exclusion violation (P2039 / 23P01) to SLOT_TAKEN', () => {
    const mapped = mapPrismaError(knownError('P2039', '23P01'));
    expect(expectAppError(mapped, 409, 'SLOT_TAKEN')).toBeInstanceOf(ConflictError);
  });

  it.each([
    ['P2034', undefined],
    ['P2034', '40P01'],
    ['P2034', '40001'],
    ['P2010', '40P01'],
  ])('maps write contention %s / %s to the conflict code of the caller', (code, state) => {
    const error = knownError(code, state);
    expectAppError(mapPrismaError(error, { onContention: 'SLOT_TAKEN' }), 409, 'SLOT_TAKEN');
    expectAppError(mapPrismaError(error), 409, 'CONFLICT');
  });

  it('maps a unique violation (P2002) to a generic conflict', () => {
    expectAppError(mapPrismaError(knownError('P2002', '23505')), 409, 'CONFLICT');
  });

  it('maps a missing record (P2025) to NOT_FOUND', () => {
    const mapped = mapPrismaError(knownError('P2025'));
    expect(expectAppError(mapped, 404, 'NOT_FOUND')).toBeInstanceOf(NotFoundError);
  });

  it.each([
    ['a CHECK violation (P2039 / 23514)', 'P2039', '23514'],
    ['a foreign key violation (P2003)', 'P2003', '23503'],
    ['an unexpected meta shape', 'P2039', undefined],
  ])('turns %s into an unknown error that keeps only the codes', (_label, code, state) => {
    const mapped = mapPrismaError(knownError(code, state));
    expect(mapped).not.toBeInstanceOf(AppError);
    expect(mapped).toBeInstanceOf(Error);
    const { message } = mapped as Error;
    expect(message).toContain(code);
    expect(message).toContain(state ?? 'unknown');
    expect(message).not.toContain('ana@example.com');
  });

  it('ignores a malformed driver adapter error', () => {
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2039',
      clientVersion: '7.10.0',
      meta: { driverAdapterError: { cause: 'not an object' } },
    });
    expect((mapPrismaError(error) as Error).message).toContain('SQLSTATE unknown');
  });

  it('returns non-Prisma errors untouched', () => {
    const error = new Error('boom');
    expect(mapPrismaError(error)).toBe(error);
    expect(mapPrismaError('text')).toBe('text');
  });
});

describe('isUniqueViolation', () => {
  it.each([
    ['P2002', undefined],
    ['P2002', '23505'],
    ['P2039', '23505'],
  ])('recognizes %s / %s', (code, state) => {
    expect(isUniqueViolation(knownError(code, state))).toBe(true);
  });

  it.each([
    ['an exclusion violation', knownError('P2039', '23P01')],
    ['a missing record', knownError('P2025')],
    ['a plain error', new Error('P2002')],
  ])('rejects %s', (_label, error) => {
    expect(isUniqueViolation(error)).toBe(false);
  });
});
