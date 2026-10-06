import { hash, verify } from '@node-rs/argon2';

import type { PasswordHasher } from './auth.ports';

export interface Argon2Params {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

// OWASP Password Storage Cheat Sheet, Argon2id minimum: m=19 MiB, t=2, p=1. The variant is the
// library default (Argon2id): its `Algorithm` const enum cannot be imported under
// verbatimModuleSyntax, so the test pins the `$argon2id$` prefix instead.
export const OWASP_ARGON2ID_PARAMS: Argon2Params = Object.freeze({
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

export function createPasswordHasher(params: Argon2Params = OWASP_ARGON2ID_PARAMS): PasswordHasher {
  const options = { ...params };
  return {
    hash: (password) => hash(password, options),
    verify: (passwordHash, password) => verify(passwordHash, password),
  };
}
