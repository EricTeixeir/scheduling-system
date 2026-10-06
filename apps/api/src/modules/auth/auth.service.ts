import type { LoginOutput, RegisterOutput } from '@scheduling/shared';

import { isLocked, lockedUntilAfter } from '../../domain/auth/lockout-policy';
import type { Clock } from '../../domain/time/clock';
import { addMinutes } from '../../domain/time/instant';
import { ConflictError, UnauthenticatedError } from '../../errors/app-errors';
import type {
  AccessTokens,
  PasswordHasher,
  RefreshTokenRepository,
  StoredRefreshToken,
  UserCredentials,
  UserProfile,
  UserRepository,
} from './auth.ports';
import { generateRefreshToken, hashRefreshToken, isWellFormedRefreshToken } from './refresh-token';

export const SESSION_LIFETIME_MINUTES = 7 * 24 * 60;
export const REFRESH_REUSE_GRACE_SECONDS = 10;
export const INVALID_CREDENTIALS_DETAIL = 'E-mail ou senha inválidos.';
export const EMAIL_TAKEN_DETAIL = 'Este e-mail já está cadastrado.';

const DUMMY_PASSWORD = 'timing-equalization-only-never-a-real-password';

export interface Session {
  readonly user: UserProfile;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly issuedAt: Date;
  readonly refreshExpiresAt: Date;
}

export type RefreshOutcome =
  | { readonly status: 'ROTATED'; readonly session: Session }
  | { readonly status: 'INVALID' }
  | { readonly status: 'RACE' }
  | { readonly status: 'REUSED'; readonly userId: string; readonly familyId: string };

export interface AuthService {
  register(input: RegisterOutput): Promise<Session>;
  login(input: LoginOutput): Promise<Session>;
  refresh(refreshToken: string | undefined): Promise<RefreshOutcome>;
  logout(refreshToken: string | undefined): Promise<void>;
  authenticate(accessToken: string): Promise<UserProfile | undefined>;
}

export interface AuthServiceDependencies {
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly accessTokens: AccessTokens;
  readonly clock: Clock;
}

function toProfile({ id, name, email, role }: UserProfile): UserProfile {
  return { id, name, email, role };
}

export function createAuthService({
  users,
  refreshTokens,
  passwordHasher,
  accessTokens,
  clock,
}: AuthServiceDependencies): AuthService {
  let dummyHash: Promise<string> | undefined;

  // An unknown email must cost the same Argon2 verify as a known one, or response time
  // would reveal which emails are registered.
  async function verifyAgainstDummyHash(password: string): Promise<void> {
    dummyHash ??= passwordHasher.hash(DUMMY_PASSWORD);
    await passwordHasher.verify(await dummyHash, password);
  }

  async function startSession(user: UserProfile): Promise<Session> {
    const issuedAt = clock.now();
    const refreshExpiresAt = addMinutes(issuedAt, SESSION_LIFETIME_MINUTES);
    const refreshToken = generateRefreshToken();
    await refreshTokens.createFamily({
      userId: user.id,
      expiresAt: refreshExpiresAt,
      tokenHash: hashRefreshToken(refreshToken),
    });
    const accessToken = await accessTokens.sign(user);
    return { user, accessToken, refreshToken, issuedAt, refreshExpiresAt };
  }

  async function recordFailedLogin(userId: string): Promise<void> {
    const failures = await users.incrementFailedLogins(userId);
    const lockedUntil = lockedUntilAfter(failures, clock.now());
    if (lockedUntil !== undefined) await users.extendLockUntil(userId, lockedUntil);
  }

  // Browser tabs share one cookie jar, so two tabs refreshing together present the same token:
  // the loser must not log both out. Within the window it only learns to retry with the cookie
  // the winner received; no token is issued, so a replayed stolen token gains nothing.
  async function refuseRevokedToken(
    stored: StoredRefreshToken,
    now: Date,
  ): Promise<RefreshOutcome> {
    const rotatedRecently =
      stored.rotatedAt !== null &&
      now.getTime() - stored.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_SECONDS * 1000;
    if (rotatedRecently) return { status: 'RACE' };
    await refreshTokens.revokeFamily(stored.familyId, now);
    return { status: 'REUSED', userId: stored.userId, familyId: stored.familyId };
  }

  async function clearFailedLogins(user: UserCredentials): Promise<void> {
    if (user.failedLoginCount > 0 || user.lockedUntil !== null) {
      await users.resetFailedLogins(user.id);
    }
  }

  return {
    async register({ name, email, password }) {
      const passwordHash = await passwordHasher.hash(password);
      const user = await users.insertIfEmailFree({ name, email, passwordHash, role: 'CLIENT' });
      if (user === undefined) throw new ConflictError('CONFLICT', EMAIL_TAKEN_DETAIL);
      return startSession(user);
    },

    // Unknown email, wrong password and locked account end in the same error after the same
    // Argon2 work. A correct password never lifts an active lock.
    async login({ email, password }) {
      const user = await users.findCredentialsByEmail(email);
      if (user === undefined) {
        await verifyAgainstDummyHash(password);
        throw new UnauthenticatedError(INVALID_CREDENTIALS_DETAIL);
      }
      const passwordMatches = await passwordHasher.verify(user.passwordHash, password);
      if (!passwordMatches) {
        await recordFailedLogin(user.id);
        throw new UnauthenticatedError(INVALID_CREDENTIALS_DETAIL);
      }
      if (isLocked(user.lockedUntil, clock.now())) {
        throw new UnauthenticatedError(INVALID_CREDENTIALS_DETAIL);
      }
      await clearFailedLogins(user);
      return startSession(toProfile(user));
    },

    async refresh(refreshToken) {
      if (!isWellFormedRefreshToken(refreshToken)) return { status: 'INVALID' };
      const stored = await refreshTokens.findByHash(hashRefreshToken(refreshToken));
      if (stored === undefined || stored.familyRevokedAt !== null) return { status: 'INVALID' };

      const now = clock.now();
      if (now.getTime() >= stored.familyExpiresAt.getTime()) return { status: 'INVALID' };

      if (stored.revokedAt !== null) return refuseRevokedToken(stored, now);

      const user = await users.findProfileById(stored.userId);
      if (user === undefined) return { status: 'INVALID' };

      const nextRefreshToken = generateRefreshToken();
      const rotated = await refreshTokens.rotateIfActive({
        tokenId: stored.id,
        familyId: stored.familyId,
        nextTokenHash: hashRefreshToken(nextRefreshToken),
        now,
      });
      if (!rotated) {
        const current = await refreshTokens.findByHash(hashRefreshToken(refreshToken));
        if (current === undefined || current.familyRevokedAt !== null) return { status: 'INVALID' };
        return refuseRevokedToken(current, now);
      }

      const accessToken = await accessTokens.sign(user);
      return {
        status: 'ROTATED',
        session: {
          user,
          accessToken,
          refreshToken: nextRefreshToken,
          issuedAt: now,
          refreshExpiresAt: stored.familyExpiresAt,
        },
      };
    },

    async logout(refreshToken) {
      if (!isWellFormedRefreshToken(refreshToken)) return;
      const stored = await refreshTokens.findByHash(hashRefreshToken(refreshToken));
      if (stored !== undefined) await refreshTokens.revokeFamily(stored.familyId, clock.now());
    },

    async authenticate(accessToken) {
      const claims = await accessTokens.verify(accessToken);
      if (claims === undefined) return undefined;
      return users.findProfileById(claims.userId);
    },
  };
}
