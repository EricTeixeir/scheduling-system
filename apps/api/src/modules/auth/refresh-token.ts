import { createHash, randomBytes } from 'node:crypto';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export function isWellFormedRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && REFRESH_TOKEN_PATTERN.test(value);
}

// A fast hash is correct here, unlike for passwords: the token carries 256 random bits, so a
// leaked hash cannot be reversed by guessing, and lookups stay a single indexed equality.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
