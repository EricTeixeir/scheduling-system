import {
  demoAccountsResponseSchema,
  EMAIL_MAX_LENGTH,
  loginSchema,
  registerSchema,
  userSchema,
} from '@scheduling/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { RateLimitedError, UnauthenticatedError } from '../../errors/app-errors';
import { currentUser, type AuthGuards } from '../../http/auth-guards';
import { parseInput } from '../../http/parse-input';
import { clearSessionCookies, readRefreshTokenCookie, setSessionCookies } from './auth-cookies';
import type { AuthService } from './auth.service';
import { DEMO_NOTICE, DEMO_USERS } from './demo-accounts';

export const LOGIN_ATTEMPTS_PER_EMAIL_PER_MINUTE = 5;
export const LOGIN_REQUESTS_PER_IP_PER_MINUTE = 20;
export const REGISTER_REQUESTS_PER_IP_PER_MINUTE = 5;
export const REFRESH_REQUESTS_PER_IP_PER_MINUTE = 30;

const ONE_MINUTE = '1 minute';
const SESSION_ENDED_DETAIL = 'Sua sessão expirou. Entre novamente.';
const REFRESH_RACE_DETAIL =
  'A sessão acabou de ser renovada em outra aba. Repita a requisição original.';

export interface AuthRoutesOptions {
  readonly service: AuthService;
  readonly guards: AuthGuards;
  readonly demoMode: boolean;
}

function perIpLimit(max: number) {
  return { config: { rateLimit: { max, timeWindow: ONE_MINUTE } } };
}

function loginAttemptKey(request: FastifyRequest): string {
  const body: unknown = request.body;
  const email =
    typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase().slice(0, EMAIL_MAX_LENGTH)
      : '';
  return `${request.ip}|${email}`;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = (
  app,
  { service, guards, demoMode },
) => {
  // A second route-level limiter would be skipped: @fastify/rate-limit runs only the first one
  // per request. createRateLimit has no such guard, so it stacks on top of the per-IP limit.
  const checkLoginAttempts = app.createRateLimit({
    max: LOGIN_ATTEMPTS_PER_EMAIL_PER_MINUTE,
    timeWindow: ONE_MINUTE,
    keyGenerator: loginAttemptKey,
  });

  app.post('/register', perIpLimit(REGISTER_REQUESTS_PER_IP_PER_MINUTE), async (request, reply) => {
    const input = parseInput(registerSchema, request.body);
    const session = await service.register(input);
    setSessionCookies(reply, session);
    return reply.code(201).send(userSchema.parse(session.user));
  });

  app.post(
    '/login',
    {
      ...perIpLimit(LOGIN_REQUESTS_PER_IP_PER_MINUTE),
      preHandler: async (request, reply) => {
        const limit = await checkLoginAttempts(request);
        if (!limit.isAllowed && limit.isExceeded) {
          reply.header('retry-after', String(limit.ttlInSeconds));
          throw new RateLimitedError();
        }
      },
    },
    async (request, reply) => {
      const input = parseInput(loginSchema, request.body);
      const session = await service.login(input);
      setSessionCookies(reply, session);
      return reply.code(200).send(userSchema.parse(session.user));
    },
  );

  app.post('/refresh', perIpLimit(REFRESH_REQUESTS_PER_IP_PER_MINUTE), async (request, reply) => {
    const outcome = await service.refresh(readRefreshTokenCookie(request));
    if (outcome.status === 'RACE') {
      throw new UnauthenticatedError(REFRESH_RACE_DETAIL, 'REFRESH_RACE');
    }
    if (outcome.status !== 'ROTATED') {
      if (outcome.status === 'REUSED') {
        request.log.warn(
          { userId: outcome.userId, familyId: outcome.familyId },
          'refresh token reuse detected, session family revoked',
        );
      }
      clearSessionCookies(reply);
      throw new UnauthenticatedError(SESSION_ENDED_DETAIL);
    }
    setSessionCookies(reply, outcome.session);
    return reply.code(204).send();
  });

  app.post('/logout', async (request, reply) => {
    await service.logout(readRefreshTokenCookie(request));
    clearSessionCookies(reply);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: guards.requireAuth }, (request) =>
    userSchema.parse(currentUser(request)),
  );

  if (demoMode) {
    app.get('/demo-accounts', () =>
      demoAccountsResponseSchema.parse({ notice: DEMO_NOTICE, accounts: DEMO_USERS }),
    );
  }

  return Promise.resolve();
};
