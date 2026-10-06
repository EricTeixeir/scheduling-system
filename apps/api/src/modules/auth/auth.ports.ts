import type { Role, User } from '@scheduling/shared';

export type UserProfile = User;

export interface UserCredentials extends UserProfile {
  readonly passwordHash: string;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

export interface NewUser {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: Role;
}

export interface UserRepository {
  findCredentialsByEmail(email: string): Promise<UserCredentials | undefined>;
  findProfileById(id: string): Promise<UserProfile | undefined>;
  insertIfEmailFree(user: NewUser): Promise<UserProfile | undefined>;
  // Must increment inside the store (no read-modify-write): concurrent failures each count.
  incrementFailedLogins(id: string): Promise<number>;
  extendLockUntil(id: string, until: Date): Promise<void>;
  resetFailedLogins(id: string): Promise<void>;
}

export interface StoredRefreshToken {
  readonly id: string;
  readonly familyId: string;
  readonly userId: string;
  readonly revokedAt: Date | null;
  readonly rotatedAt: Date | null;
  readonly familyExpiresAt: Date;
  readonly familyRevokedAt: Date | null;
}

export interface NewRefreshTokenFamily {
  readonly userId: string;
  readonly expiresAt: Date;
  readonly tokenHash: string;
}

export interface RefreshTokenRotation {
  readonly tokenId: string;
  readonly familyId: string;
  readonly nextTokenHash: string;
  readonly now: Date;
}

export interface RefreshTokenRepository {
  createFamily(family: NewRefreshTokenFamily): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | undefined>;
  // Must revoke conditionally (only while still active) and atomically with storing the
  // successor: of two concurrent rotations of one token exactly one resolves true.
  rotateIfActive(rotation: RefreshTokenRotation): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  readonly userId: string;
  readonly role: Role;
}

export interface AccessTokens {
  sign(user: Pick<UserProfile, 'id' | 'role'>): Promise<string>;
  verify(token: string): Promise<AccessTokenClaims | undefined>;
}
