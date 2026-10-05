import { randomUUID } from 'node:crypto';

import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';

export const REQUEST_ID_HEADER = 'x-request-id';

// Any incoming X-Request-Id is ignored: a client-chosen id could forge or collide log correlation.
export function generateRequestId(): string {
  return randomUUID();
}

export function echoRequestId(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  reply.header(REQUEST_ID_HEADER, request.id);
  done();
}
