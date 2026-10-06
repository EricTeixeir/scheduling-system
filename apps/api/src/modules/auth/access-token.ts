import { ROLES, uuidSchema } from '@scheduling/shared';
import { errors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

import type { Clock } from '../../domain/time/clock';
import type { AccessTokens } from './auth.ports';

export const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

const ALGORITHM = 'HS256';

const claimsSchema = z.object({
  sub: uuidSchema,
  role: z.enum(ROLES),
});

export interface AccessTokenOptions {
  readonly secret: string;
  readonly clock: Clock;
}

function epochSeconds(instant: Date): number {
  return Math.floor(instant.getTime() / 1000);
}

export function createAccessTokens({ secret, clock }: AccessTokenOptions): AccessTokens {
  const key = new TextEncoder().encode(secret);

  return {
    sign({ id, role }) {
      const issuedAt = epochSeconds(clock.now());
      return new SignJWT({ role })
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setSubject(id)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
        .sign(key);
    },

    async verify(token) {
      try {
        // The algorithm allowlist is what rejects `alg: none` and algorithm-confusion tokens.
        const { payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          currentDate: clock.now(),
          requiredClaims: ['sub', 'exp', 'iat'],
        });
        const claims = claimsSchema.safeParse(payload);
        return claims.success ? { userId: claims.data.sub, role: claims.data.role } : undefined;
      } catch (error) {
        if (error instanceof errors.JOSEError) return undefined;
        throw error;
      }
    },
  };
}
