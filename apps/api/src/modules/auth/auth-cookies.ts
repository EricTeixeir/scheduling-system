import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ACCESS_TOKEN_TTL_SECONDS } from './access-token';
import type { Session } from './auth.service';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const ACCESS_TOKEN_COOKIE_PATH = '/api';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';

const BASE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
} as const satisfies CookieSerializeOptions;

const ACCESS_OPTIONS = { ...BASE_OPTIONS, path: ACCESS_TOKEN_COOKIE_PATH };
const REFRESH_OPTIONS = { ...BASE_OPTIONS, path: REFRESH_TOKEN_COOKIE_PATH };

export function setSessionCookies(reply: FastifyReply, session: Session): void {
  const refreshMaxAge = Math.floor(
    (session.refreshExpiresAt.getTime() - session.issuedAt.getTime()) / 1000,
  );
  reply
    .setCookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
      ...ACCESS_OPTIONS,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    })
    .setCookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
      ...REFRESH_OPTIONS,
      maxAge: Math.max(0, refreshMaxAge),
    });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply
    .clearCookie(ACCESS_TOKEN_COOKIE, ACCESS_OPTIONS)
    .clearCookie(REFRESH_TOKEN_COOKIE, REFRESH_OPTIONS);
}

type SessionCookie = typeof ACCESS_TOKEN_COOKIE | typeof REFRESH_TOKEN_COOKIE;

function readCookie(request: FastifyRequest, name: SessionCookie): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- name is one of two constants, never client input.
  return request.cookies[name];
}

export function readAccessTokenCookie(request: FastifyRequest): string | undefined {
  return readCookie(request, ACCESS_TOKEN_COOKIE);
}

export function readRefreshTokenCookie(request: FastifyRequest): string | undefined {
  return readCookie(request, REFRESH_TOKEN_COOKIE);
}
