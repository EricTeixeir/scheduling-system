import { describe, expect, it } from 'vitest';

import { createPasswordHasher, OWASP_ARGON2ID_PARAMS } from './password-hasher';

const TEST_PASSWORD = 'test-password-123';

describe('createPasswordHasher', () => {
  const hasher = createPasswordHasher();

  it('uses the OWASP Argon2id parameters by default', async () => {
    expect(OWASP_ARGON2ID_PARAMS).toEqual({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    expect(await hasher.hash(TEST_PASSWORD)).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifies the password it hashed', async () => {
    expect(await hasher.verify(await hasher.hash(TEST_PASSWORD), TEST_PASSWORD)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hasher.hash(TEST_PASSWORD);
    expect(await hasher.verify(stored, `${TEST_PASSWORD}x`)).toBe(false);
    expect(await hasher.verify(stored, TEST_PASSWORD.toUpperCase())).toBe(false);
  });

  it('salts every hash and never contains the password', async () => {
    const first = await hasher.hash(TEST_PASSWORD);
    const second = await hasher.hash(TEST_PASSWORD);
    expect(first).not.toBe(second);
    expect(first).not.toContain(TEST_PASSWORD);
  });

  it('accepts custom parameters and still verifies across them', async () => {
    const cheap = createPasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });
    const stored = await cheap.hash(TEST_PASSWORD);
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=8,t=1,p=1\$/);
    expect(await hasher.verify(stored, TEST_PASSWORD)).toBe(true);
  });

  it('fails loudly on a malformed stored hash', async () => {
    await expect(hasher.verify('not-a-phc-string', TEST_PASSWORD)).rejects.toThrow();
  });
});
