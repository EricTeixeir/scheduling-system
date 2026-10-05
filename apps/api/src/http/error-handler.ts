import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError, NotFoundError } from '../errors/app-errors';
import { translateFrameworkError } from './framework-errors';
import { PROBLEM_CONTENT_TYPE, toProblemDetails } from './problem-details';
import { REQUEST_ID_HEADER } from './request-id';

function sendProblem(reply: FastifyReply, error: AppError): FastifyReply {
  return reply
    .code(error.status)
    .header(REQUEST_ID_HEADER, reply.request.id)
    .type(PROBLEM_CONTENT_TYPE)
    .send(toProblemDetails(error, reply.request.id));
}

export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const known = error instanceof AppError ? error : translateFrameworkError(error);
  if (known !== undefined) {
    request.log.info({ code: known.code, status: known.status }, 'request refused');
    return sendProblem(reply, known);
  }
  request.log.error({ err: error }, 'unhandled error');
  return sendProblem(
    reply,
    new AppError(500, 'INTERNAL', {
      detail: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
    }),
  );
}

export function replyNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, new NotFoundError('Rota não encontrada.'));
}
