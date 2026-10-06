import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken, isWellFormedRefreshToken } from './refresh-token';

describe('generateRefreshToken', () => {
  it('encodes 256 random bits as 43 base64url characters', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateRefreshToken));
    expect(tokens.size).toBe(1000);
  });
});

describe('isWellFormedRefreshToken', () => {
  it('accepts a generated token', () => {
    expect(isWellFormedRefreshToken(generateRefreshToken())).toBe(true);
  });

  it.each([undefined, null, 42, '', 'short', `${'a'.repeat(43)}=`, `${'a'.repeat(42)}+`])(
    'rejects %j',
    (value) => {
      expect(isWellFormedRefreshToken(value)).toBe(false);
    },
  );
});

describe('hashRefreshToken', () => {
  it('is the lowercase hex SHA-256 of the token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and never contains the token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
  });
});
