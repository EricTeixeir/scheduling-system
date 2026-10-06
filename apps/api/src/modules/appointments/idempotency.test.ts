import { describe, expect, it } from 'vitest';

import { parseIdempotencyKey } from '../../http/idempotency-key';
import { requestHashOf } from './idempotency';

describe('requestHashOf', () => {
  it('is a lowercase hex SHA-256', () => {
    expect(requestHashOf({ startsAt: '2026-10-06T13:00:00Z' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes the same instant equally whatever the offset', () => {
    expect(requestHashOf({ startsAt: '2026-10-06T10:00:00-03:00' })).toBe(
      requestHashOf({ startsAt: '2026-10-06T13:00:00.000Z' }),
    );
  });

  it('distinguishes notes and instants', () => {
    const base = requestHashOf({ startsAt: '2026-10-06T13:00:00Z' });
    expect(requestHashOf({ startsAt: '2026-10-06T13:00:00Z', notes: 'x' })).not.toBe(base);
    expect(requestHashOf({ startsAt: '2026-10-06T13:30:00Z' })).not.toBe(base);
  });

  it('distinguishes the client an admin books for, keeping client hashes unchanged', () => {
    const startsAt = '2026-10-06T13:00:00Z';
    const forOne = requestHashOf({ startsAt, clientId: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c' });
    const forOther = requestHashOf({ startsAt, clientId: '0f8fad5b-d9cb-469f-a165-70867728950e' });
    expect(forOne).not.toBe(forOther);
    expect(forOne).not.toBe(requestHashOf({ startsAt }));
    expect(requestHashOf({ startsAt })).toBe(
      'd0ad54b888b4759422d5d50ff86323287ee514003c6a4734749dd25378ba31df',
    );
  });
});

describe('parseIdempotencyKey', () => {
  it('accepts a UUID and normalizes it to lowercase', () => {
    expect(parseIdempotencyKey('0F8FAD5B-D9CB-469F-A165-70867728950E')).toBe(
      '0f8fad5b-d9cb-469f-a165-70867728950e',
    );
  });

  it.each([undefined, '', 'abc', ['0f8fad5b-d9cb-469f-a165-70867728950e']])(
    'refuses %j with a 400 VALIDATION_FAILED',
    (header) => {
      expect(() => parseIdempotencyKey(header)).toThrow(
        expect.objectContaining({ status: 400, code: 'VALIDATION_FAILED' }),
      );
    },
  );
});
