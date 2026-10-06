import { randomUUID } from 'node:crypto';

import type {
  NewUser,
  RefreshTokenRepository,
  UserCredentials,
  UserRepository,
} from '../modules/auth/auth.ports';
import { createPasswordHasher } from '../modules/auth/password-hasher';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: NewUser['role'];
  passwordHash: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

interface FamilyRow {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface TokenRow {
  id: string;
  familyId: string;
  tokenHash: string;
  revokedAt: Date | null;
  rotatedAt: Date | null;
}

export interface InMemoryUserRepository extends UserRepository {
  readonly rows: Map<string, UserRow>;
  byEmail(email: string): UserRow | undefined;
}

export interface InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  readonly families: Map<string, FamilyRow>;
  readonly tokens: Map<string, TokenRow>;
}

function credentials(row: UserRow): UserCredentials {
  return { ...row };
}

export function createInMemoryUserRepository(): InMemoryUserRepository {
  const rows = new Map<string, UserRow>();
  const byEmail = (email: string) => [...rows.values()].find((row) => row.email === email);

  function row(id: string): UserRow {
    const found = rows.get(id);
    if (found === undefined) throw new Error(`no user ${id}`);
    return found;
  }

  return {
    rows,
    byEmail,
    findCredentialsByEmail: (email) => {
      const found = byEmail(email);
      return Promise.resolve(found === undefined ? undefined : credentials(found));
    },
    findProfileById: (id) => {
      const found = rows.get(id);
      return Promise.resolve(
        found === undefined
          ? undefined
          : { id: found.id, name: found.name, email: found.email, role: found.role },
      );
    },
    insertIfEmailFree: (user) => {
      if (byEmail(user.email) !== undefined) return Promise.resolve(undefined);
      const id = randomUUID();
      rows.set(id, { id, ...user, failedLoginCount: 0, lockedUntil: null });
      return Promise.resolve({ id, name: user.name, email: user.email, role: user.role });
    },
    incrementFailedLogins: (id) => {
      const found = row(id);
      found.failedLoginCount += 1;
      return Promise.resolve(found.failedLoginCount);
    },
    extendLockUntil: (id, until) => {
      const found = row(id);
      if (found.lockedUntil === null || found.lockedUntil < until) found.lockedUntil = until;
      return Promise.resolve();
    },
    resetFailedLogins: (id) => {
      const found = row(id);
      found.failedLoginCount = 0;
      found.lockedUntil = null;
      return Promise.resolve();
    },
  };
}

export function createInMemoryRefreshTokenRepository(): InMemoryRefreshTokenRepository {
  const families = new Map<string, FamilyRow>();
  const tokens = new Map<string, TokenRow>();

  function addToken(familyId: string, tokenHash: string): void {
    const id = randomUUID();
    tokens.set(id, { id, familyId, tokenHash, revokedAt: null, rotatedAt: null });
  }

  return {
    families,
    tokens,
    createFamily: ({ userId, expiresAt, tokenHash }) => {
      const id = randomUUID();
      families.set(id, { id, userId, expiresAt, revokedAt: null });
      addToken(id, tokenHash);
      return Promise.resolve();
    },
    findByHash: (tokenHash) => {
      const token = [...tokens.values()].find((row) => row.tokenHash === tokenHash);
      const family = token === undefined ? undefined : families.get(token.familyId);
      if (token === undefined || family === undefined) return Promise.resolve(undefined);
      return Promise.resolve({
        id: token.id,
        familyId: family.id,
        userId: family.userId,
        revokedAt: token.revokedAt,
        rotatedAt: token.rotatedAt,
        familyExpiresAt: family.expiresAt,
        familyRevokedAt: family.revokedAt,
      });
    },
    rotateIfActive: ({ tokenId, familyId, nextTokenHash, now }) => {
      const token = tokens.get(tokenId);
      if (token === undefined || token.revokedAt !== null) return Promise.resolve(false);
      token.revokedAt = now;
      token.rotatedAt = now;
      addToken(familyId, nextTokenHash);
      return Promise.resolve(true);
    },
    revokeFamily: (familyId, now) => {
      const family = families.get(familyId);
      if (family !== undefined) family.revokedAt ??= now;
      for (const token of tokens.values()) {
        if (token.familyId === familyId) token.revokedAt ??= now;
      }
      return Promise.resolve();
    },
  };
}

export const cheapestArgon2idHasher = createPasswordHasher({
  memoryCost: 8,
  timeCost: 1,
  parallelism: 1,
});
