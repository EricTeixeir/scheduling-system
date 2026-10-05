import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';

import { ForbiddenError } from '../errors/app-errors';

export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'fetch';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// A cross-site page cannot send a custom header without a CORS preflight, which the origin
// allowlist rejects. That is what will protect cookie-authenticated writes.
export function requireCsrfHeader(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  if (
    SAFE_METHODS.has(request.method) ||
    request.headers['x-requested-with'] === CSRF_HEADER_VALUE
  ) {
    done();
    return;
  }
  done(new ForbiddenError('FORBIDDEN', `Envie o cabeçalho ${CSRF_HEADER}: ${CSRF_HEADER_VALUE}.`));
}
