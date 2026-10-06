import { decodeJwt, decodeProtectedHeader, SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../../test/fake-clock';
import { ACCESS_TOKEN_TTL_SECONDS, createAccessTokens } from './access-token';

const SECRET = 'test-secret-with-at-least-32-characters!';
const USER = { id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c', role: 'CLIENT' } as const;

function setup() {
  const clock = createFakeClock('2026-10-05T12:00:00.000Z');
  return { clock, tokens: createAccessTokens({ secret: SECRET, clock }) };
}

describe('createAccessTokens', () => {
  it('signs HS256 with sub, role, iat and a 30-minute exp', async () => {
    const { tokens } = setup();
    const token = await tokens.sign(USER);
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const claims = decodeJwt(token);
    expect(claims).toMatchObject({ sub: USER.id, role: 'CLIENT' });
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(1800);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(1800);
  });

  it('verifies its own token', async () => {
    const { tokens } = setup();
    expect(await tokens.verify(await tokens.sign(USER))).toEqual({
      userId: USER.id,
      role: 'CLIENT',
    });
  });

  it('accepts the token until just before expiry and rejects it from expiry on', async () => {
    const { clock, tokens } = setup();
    const token = await tokens.sign(USER);
    clock.advanceSeconds(ACCESS_TOKEN_TTL_SECONDS - 1);
    expect(await tokens.verify(token)).toBeDefined();
    clock.advanceSeconds(1);
    expect(await tokens.verify(token)).toBeUndefined();
  });

  it('rejects a tampered payload', async () => {
    const { tokens } = setup();
    const token = await tokens.sign(USER);
    const [header, , signature] = token.split('.');
    const escalated = { ...decodeJwt(token), role: 'ADMIN' };
    const forged = Buffer.from(JSON.stringify(escalated)).toString('base64url');
    expect(await tokens.verify(`${String(header)}.${forged}.${String(signature)}`)).toBeUndefined();
  });

  it('rejects a token signed with another secret', async () => {
    const { clock } = setup();
    const other = createAccessTokens({ secret: `${SECRET}-other`, clock });
    const { tokens } = setup();
    expect(await tokens.verify(await other.sign(USER))).toBeUndefined();
  });

  it('rejects an unsigned alg:none token', async () => {
    const { tokens } = setup();
    const unsigned = new UnsecuredJWT({ role: 'ADMIN' })
      .setSubject(USER.id)
      .setIssuedAt()
      .setExpirationTime('30m')
      .encode();
    expect(await tokens.verify(unsigned)).toBeUndefined();
  });

  it('rejects another HMAC algorithm even with the right secret', async () => {
    const { tokens } = setup();
    const hs512 = await new SignJWT({ role: 'CLIENT' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject(USER.id)
      .setIssuedAt(Math.floor(Date.parse('2026-10-05T12:00:00.000Z') / 1000))
      .setExpirationTime(Math.floor(Date.parse('2026-10-05T12:30:00.000Z') / 1000))
      .sign(new TextEncoder().encode(SECRET));
    expect(await tokens.verify(hs512)).toBeUndefined();
  });

  it.each<[string, { sub: string; role?: string }]>([
    ['a non-uuid subject', { sub: 'admin', role: 'CLIENT' }],
    ['an unknown role', { sub: USER.id, role: 'ROOT' }],
    ['a missing role', { sub: USER.id }],
  ])('rejects %s', async (_label, claims) => {
    const { tokens } = setup();
    const issuedAt = Math.floor(Date.parse('2026-10-05T12:00:00.000Z') / 1000);
    const token = await new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 60)
      .sign(new TextEncoder().encode(SECRET));
    expect(await tokens.verify(token)).toBeUndefined();
  });

  it.each(['', 'garbage', 'a.b.c'])('rejects the malformed token %j', async (token) => {
    const { tokens } = setup();
    expect(await tokens.verify(token)).toBeUndefined();
  });
});
