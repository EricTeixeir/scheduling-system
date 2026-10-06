import type { Role, User } from '@scheduling/shared';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';

import { ForbiddenError, UnauthenticatedError } from '../errors/app-errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export type AuthenticateRequest = (request: FastifyRequest) => Promise<User | undefined>;

export interface AuthGuards {
  readonly requireAuth: preHandlerAsyncHookHandler;
  requireRole(role: Role): preHandlerAsyncHookHandler;
}

export function registerAuthGuards(
  app: FastifyInstance,
  authenticate: AuthenticateRequest,
): AuthGuards {
  app.decorateRequest('user', null);

  return {
    async requireAuth(request) {
      const user = await authenticate(request);
      if (user === undefined) throw new UnauthenticatedError();
      request.user = user;
    },

    requireRole(role) {
      return (request) => {
        if (request.user === null) return Promise.reject(new UnauthenticatedError());
        if (request.user.role !== role) return Promise.reject(new ForbiddenError());
        return Promise.resolve();
      };
    },
  };
}

export function currentUser(request: FastifyRequest): User {
  if (request.user === null) {
    throw new Error('currentUser() needs the requireAuth guard on this route');
  }
  return request.user;
}
