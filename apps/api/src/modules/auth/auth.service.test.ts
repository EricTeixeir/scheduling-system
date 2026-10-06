import { describe, expect, it, vi } from 'vitest';

import { ConflictError, UnauthenticatedError } from '../../errors/app-errors';
import { createFakeClock } from '../../test/fake-clock';
import {
  createInMemoryRefreshTokenRepository,
  createInMemoryUserRepository,
} from '../../test/in-memory-auth';
import { createAccessTokens } from './access-token';
import type { PasswordHasher } from './auth.ports';
import {
  createAuthService,
  EMAIL_TAKEN_DETAIL,
  INVALID_CREDENTIALS_DETAIL,
  REFRESH_REUSE_GRACE_SECONDS,
  SESSION_LIFETIME_MINUTES,
  type RefreshOutcome,
  type Session,
} from './auth.service';
import { hashRefreshToken } from './refresh-token';

const TEST_PASSWORD = 'test-password-123';
const WRONG_TEST_PASSWORD = 'test-wrong-password';
const MARIA = { name: 'Maria Silva', email: 'maria@example.com', password: TEST_PASSWORD };

function createFakeHasher() {
  return {
    hash: vi.fn<PasswordHasher['hash']>((password) => Promise.resolve(`hashed:${password}`)),
    verify: vi.fn<PasswordHasher['verify']>((hash, password) =>
      Promise.resolve(hash === `hashed:${password}`),
    ),
  };
}

function setup() {
  const clock = createFakeClock('2026-10-05T12:00:00.000Z');
  const users = createInMemoryUserRepository();
  const refreshTokens = createInMemoryRefreshTokenRepository();
  const passwordHasher = createFakeHasher();
  const accessTokens = createAccessTokens({
    secret: 'test-secret-with-at-least-32-characters!',
    clock,
  });
  const service = createAuthService({ users, refreshTokens, passwordHasher, accessTokens, clock });
  return { clock, users, refreshTokens, passwordHasher, accessTokens, service };
}

function rotated(outcome: RefreshOutcome): Session {
  if (outcome.status !== 'ROTATED') throw new Error(`expected ROTATED, got ${outcome.status}`);
  return outcome.session;
}

function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (reason: unknown) => reason,
  );
}

async function expectInvalidCredentials(promise: Promise<unknown>): Promise<void> {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(UnauthenticatedError);
  expect((error as UnauthenticatedError).detail).toBe(INVALID_CREDENTIALS_DETAIL);
}

describe('register', () => {
  it('always creates a CLIENT with a hashed password and starts a session', async () => {
    const { service, users, accessTokens } = setup();
    const session = await service.register(MARIA);
    expect(session.user).toMatchObject({ name: 'Maria Silva', email: MARIA.email, role: 'CLIENT' });
    expect(users.byEmail(MARIA.email)?.passwordHash).toBe(`hashed:${TEST_PASSWORD}`);
    expect(await accessTokens.verify(session.accessToken)).toEqual({
      userId: session.user.id,
      role: 'CLIENT',
    });
  });

  it('refuses a duplicate email with 409 CONFLICT', async () => {
    const { service } = setup();
    await service.register(MARIA);
    const error = await rejection(service.register({ ...MARIA, name: 'Outra' }));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', detail: EMAIL_TAKEN_DETAIL });
  });

  it('opens a refresh family that expires 7 days later', async () => {
    const { service, refreshTokens } = setup();
    const session = await service.register(MARIA);
    expect(SESSION_LIFETIME_MINUTES).toBe(7 * 24 * 60);
    expect(session.refreshExpiresAt.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    const stored = await refreshTokens.findByHash(hashRefreshToken(session.refreshToken));
    expect(stored?.familyExpiresAt.toISOString()).toBe('2026-10-12T12:00:00.000Z');
  });
});

describe('login', () => {
  async function registered() {
    const context = setup();
    const { user } = await context.service.register(MARIA);
    context.passwordHasher.verify.mockClear();
    context.passwordHasher.hash.mockClear();
    return { ...context, user };
  }

  const wrong = { email: MARIA.email, password: WRONG_TEST_PASSWORD };
  const right = { email: MARIA.email, password: TEST_PASSWORD };

  it('starts a session with the right password', async () => {
    const { service, user } = await registered();
    const session = await service.login(right);
    expect(session.user).toEqual(user);
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('refuses a wrong password with the uniform error and counts the failure', async () => {
    const { service, users } = await registered();
    await expectInvalidCredentials(service.login(wrong));
    expect(users.byEmail(MARIA.email)?.failedLoginCount).toBe(1);
  });

  it('refuses an unknown email with the same error after verifying a dummy hash', async () => {
    const { service, passwordHasher } = await registered();
    await expectInvalidCredentials(
      service.login({ email: 'ghost@example.com', password: TEST_PASSWORD }),
    );
    expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
    expect(passwordHasher.verify.mock.calls[0]?.[1]).toBe(TEST_PASSWORD);
    expect(passwordHasher.verify.mock.calls[0]?.[0]).toMatch(/^hashed:/);
  });

  it('computes the dummy hash once', async () => {
    const { service, passwordHasher } = await registered();
    const ghost = { email: 'ghost@example.com', password: TEST_PASSWORD };
    await expectInvalidCredentials(service.login(ghost));
    await expectInvalidCredentials(service.login(ghost));
    expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
    expect(passwordHasher.verify).toHaveBeenCalledTimes(2);
  });

  it('locks for 1 minute after 5 failures, then 5, then 15, capped at 15', async () => {
    const { service, users, clock } = await registered();
    const lockedFor = () =>
      ((users.byEmail(MARIA.email)?.lockedUntil?.getTime() ?? 0) - clock.now().getTime()) / 60_000;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
      expect(users.byEmail(MARIA.email)?.lockedUntil).toBeNull();
    }
    await expectInvalidCredentials(service.login(wrong));
    expect(lockedFor()).toBe(1);
    await expectInvalidCredentials(service.login(wrong));
    expect(lockedFor()).toBe(5);
    await expectInvalidCredentials(service.login(wrong));
    expect(lockedFor()).toBe(15);
    await expectInvalidCredentials(service.login(wrong));
    expect(lockedFor()).toBe(15);
    expect(users.byEmail(MARIA.email)?.failedLoginCount).toBe(8);
  });

  it('keeps refusing the right password while locked, without unlocking', async () => {
    const { service, users, clock } = await registered();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
    }
    const lockedUntil = users.byEmail(MARIA.email)?.lockedUntil;
    clock.advanceSeconds(59);
    await expectInvalidCredentials(service.login(right));
    expect(users.byEmail(MARIA.email)?.lockedUntil).toEqual(lockedUntil);
    expect(users.byEmail(MARIA.email)?.failedLoginCount).toBe(5);
  });

  it('verifies the password even when locked', async () => {
    const { service, passwordHasher } = await registered();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
    }
    passwordHasher.verify.mockClear();
    await expectInvalidCredentials(service.login(right));
    expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
  });

  it('lets the right password in once the lock expires and resets the counter', async () => {
    const { service, users, clock } = await registered();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
    }
    clock.advanceMinutes(1);
    await expect(service.login(right)).resolves.toMatchObject({ user: { email: MARIA.email } });
    expect(users.byEmail(MARIA.email)).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it('escalates when failures continue after a lock expired', async () => {
    const { service, users, clock } = await registered();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
    }
    clock.advanceMinutes(2);
    await expectInvalidCredentials(service.login(wrong));
    expect(users.byEmail(MARIA.email)?.lockedUntil?.toISOString()).toBe('2026-10-05T12:07:00.000Z');
  });

  it('resets the counter on success before the threshold', async () => {
    const { service, users } = await registered();
    await expectInvalidCredentials(service.login(wrong));
    await expectInvalidCredentials(service.login(wrong));
    await service.login(right);
    expect(users.byEmail(MARIA.email)?.failedLoginCount).toBe(0);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectInvalidCredentials(service.login(wrong));
    }
    expect(users.byEmail(MARIA.email)?.lockedUntil).toBeNull();
  });

  it('does not write when there is nothing to reset', async () => {
    const { service, users } = await registered();
    const reset = vi.spyOn(users, 'resetFailedLogins');
    await service.login(right);
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('refresh', () => {
  it('rotates: new tokens in the same family, the old one revoked', async () => {
    const { service, refreshTokens, clock } = setup();
    const first = await service.register(MARIA);
    clock.advanceMinutes(10);
    const second = rotated(await service.refresh(first.refreshToken));

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    const old = await refreshTokens.findByHash(hashRefreshToken(first.refreshToken));
    const next = await refreshTokens.findByHash(hashRefreshToken(second.refreshToken));
    expect(old?.revokedAt).not.toBeNull();
    expect(next).toMatchObject({ familyId: old?.familyId, revokedAt: null });
  });

  it('never extends the absolute family expiry', async () => {
    const { service, clock } = setup();
    let session = await service.register(MARIA);
    for (let day = 1; day <= 6; day += 1) {
      clock.advanceMinutes(24 * 60);
      session = rotated(await service.refresh(session.refreshToken));
      expect(session.refreshExpiresAt.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    }
    clock.set('2026-10-12T11:59:59.999Z');
    session = rotated(await service.refresh(session.refreshToken));
    clock.set('2026-10-12T12:00:00.000Z');
    expect(await service.refresh(session.refreshToken)).toEqual({ status: 'INVALID' });
  });

  it('treats a token replayed after the grace window as reuse and revokes the whole family', async () => {
    const { service, refreshTokens, users, clock } = setup();
    const first = await service.register(MARIA);
    const second = rotated(await service.refresh(first.refreshToken));
    const userId = users.byEmail(MARIA.email)?.id;
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS + 1);

    const outcome = await service.refresh(first.refreshToken);
    const familyId = (await refreshTokens.findByHash(hashRefreshToken(first.refreshToken)))
      ?.familyId;
    expect(outcome).toEqual({ status: 'REUSED', userId, familyId });
    expect(refreshTokens.families.get(familyId ?? '')?.revokedAt).not.toBeNull();
    expect([...refreshTokens.tokens.values()].every((token) => token.revokedAt !== null)).toBe(
      true,
    );
    expect(await service.refresh(second.refreshToken)).toEqual({ status: 'INVALID' });
  });

  it('does not touch other families of the same user on reuse', async () => {
    const { service, clock } = setup();
    const first = await service.register(MARIA);
    const otherDevice = await service.login({ email: MARIA.email, password: TEST_PASSWORD });
    rotated(await service.refresh(first.refreshToken));
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS + 1);
    expect((await service.refresh(first.refreshToken)).status).toBe('REUSED');
    expect((await service.refresh(otherDevice.refreshToken)).status).toBe('ROTATED');
  });

  it('answers RACE to the loser of two concurrent rotations and keeps the family', async () => {
    const { service, refreshTokens } = setup();
    const { refreshToken } = await service.register(MARIA);

    let arrived = 0;
    let release: () => void = () => undefined;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const findByHash = refreshTokens.findByHash.bind(refreshTokens);
    vi.spyOn(refreshTokens, 'findByHash').mockImplementation(async (hash) => {
      const found = await findByHash(hash);
      arrived += 1;
      if (arrived === 2) release();
      await bothRead;
      return found;
    });

    const outcomes = await Promise.all([
      service.refresh(refreshToken),
      service.refresh(refreshToken),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['RACE', 'ROTATED']);
    const familyId = [...refreshTokens.families.keys()][0] ?? '';
    expect(refreshTokens.families.get(familyId)?.revokedAt).toBeNull();
    const [winnerToken] = outcomes.flatMap((outcome) =>
      outcome.status === 'ROTATED' ? [outcome.session.refreshToken] : [],
    );
    vi.restoreAllMocks();
    expect((await service.refresh(winnerToken)).status).toBe('ROTATED');
  });

  it('answers RACE to a second refresh with the same token within the grace window', async () => {
    const { service, refreshTokens, clock } = setup();
    const first = await service.register(MARIA);
    const winner = rotated(await service.refresh(first.refreshToken));
    clock.advanceSeconds(REFRESH_REUSE_GRACE_SECONDS);
    expect(await service.refresh(first.refreshToken)).toEqual({ status: 'RACE' });
    expect([...refreshTokens.families.values()][0]?.revokedAt).toBeNull();
    expect((await service.refresh(winner.refreshToken)).status).toBe('ROTATED');
  });

  it('treats the concurrent loser as reuse when the winner rotated before the window', async () => {
    const { service, refreshTokens, clock } = setup();
    const { refreshToken } = await service.register(MARIA);
    vi.spyOn(refreshTokens, 'rotateIfActive').mockImplementation(({ tokenId }) => {
      const row = refreshTokens.tokens.get(tokenId);
      if (row !== undefined) {
        const longAgo = new Date(clock.now().getTime() - (REFRESH_REUSE_GRACE_SECONDS + 1) * 1000);
        row.revokedAt = longAgo;
        row.rotatedAt = longAgo;
      }
      return Promise.resolve(false);
    });
    expect((await service.refresh(refreshToken)).status).toBe('REUSED');
    expect([...refreshTokens.families.values()][0]?.revokedAt).not.toBeNull();
  });

  it('answers INVALID to a concurrent loser whose family was revoked meanwhile', async () => {
    const { service, refreshTokens, clock } = setup();
    const { refreshToken } = await service.register(MARIA);
    vi.spyOn(refreshTokens, 'rotateIfActive').mockImplementation(async ({ familyId }) => {
      await refreshTokens.revokeFamily(familyId, clock.now());
      return false;
    });
    expect(await service.refresh(refreshToken)).toEqual({ status: 'INVALID' });
  });

  it.each([
    ['no cookie', undefined],
    ['a malformed token', 'not-a-token'],
    ['an unknown token', 'A'.repeat(43)],
  ])('answers INVALID for %s without touching storage', async (_label, token) => {
    const { service, refreshTokens } = setup();
    const revoke = vi.spyOn(refreshTokens, 'revokeFamily');
    expect(await service.refresh(token)).toEqual({ status: 'INVALID' });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('answers INVALID when the user no longer exists', async () => {
    const { service, users } = setup();
    const { refreshToken, user } = await service.register(MARIA);
    users.rows.delete(user.id);
    expect(await service.refresh(refreshToken)).toEqual({ status: 'INVALID' });
  });

  it('answers INVALID after logout, with no grace and no reuse report', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register(MARIA);
    await service.logout(refreshToken);
    expect(await service.refresh(refreshToken)).toEqual({ status: 'INVALID' });
  });

  it('signs the access token with the current role from storage', async () => {
    const { service, users, accessTokens } = setup();
    const { refreshToken, user } = await service.register(MARIA);
    const row = users.rows.get(user.id);
    if (row !== undefined) row.role = 'ADMIN';
    const session = rotated(await service.refresh(refreshToken));
    expect((await accessTokens.verify(session.accessToken))?.role).toBe('ADMIN');
  });
});

describe('logout', () => {
  it('revokes the family of the presented token', async () => {
    const { service, refreshTokens } = setup();
    const { refreshToken } = await service.register(MARIA);
    await service.logout(refreshToken);
    expect([...refreshTokens.families.values()][0]?.revokedAt).not.toBeNull();
  });

  it.each([undefined, 'not-a-token', 'A'.repeat(43)])('is a no-op for %j', async (token) => {
    const { service } = setup();
    await expect(service.logout(token)).resolves.toBeUndefined();
  });

  it('is idempotent', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register(MARIA);
    await service.logout(refreshToken);
    await expect(service.logout(refreshToken)).resolves.toBeUndefined();
  });
});

describe('authenticate', () => {
  it('returns the stored profile for a valid token', async () => {
    const { service } = setup();
    const { accessToken, user } = await service.register(MARIA);
    expect(await service.authenticate(accessToken)).toEqual(user);
  });

  it('trusts the stored role over the role in the token', async () => {
    const { service, users } = setup();
    const { accessToken, user } = await service.register(MARIA);
    const row = users.rows.get(user.id);
    if (row !== undefined) row.role = 'ADMIN';
    expect((await service.authenticate(accessToken))?.role).toBe('ADMIN');
  });

  it('rejects a token of a deleted user', async () => {
    const { service, users } = setup();
    const { accessToken, user } = await service.register(MARIA);
    users.rows.delete(user.id);
    expect(await service.authenticate(accessToken)).toBeUndefined();
  });

  it('rejects an invalid token without a lookup', async () => {
    const { service, users } = setup();
    const lookup = vi.spyOn(users, 'findProfileById');
    expect(await service.authenticate('garbage')).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
