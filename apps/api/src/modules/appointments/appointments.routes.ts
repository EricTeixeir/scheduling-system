import {
  appointmentSchema,
  clientAppointmentsQuerySchema,
  createAppointmentSchema,
  idParamsSchema,
  paginatedSchema,
} from '@scheduling/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { RateLimitedError } from '../../errors/app-errors';
import { currentUser, type AuthGuards } from '../../http/auth-guards';
import { IDEMPOTENT_REPLAY_HEADER, parseIdempotencyKey } from '../../http/idempotency-key';
import { parseInput } from '../../http/parse-input';
import type { AppointmentsService, RequestContext } from './appointments.service';

export const CREATE_REQUESTS_PER_USER_PER_MINUTE = 10;

const appointmentPageSchema = paginatedSchema(appointmentSchema);

export interface AppointmentsRoutesOptions {
  readonly service: AppointmentsService;
  readonly guards: AuthGuards;
}

function requestContext(request: FastifyRequest): RequestContext {
  const { id, role } = currentUser(request);
  return { actor: { id, role }, requestId: request.id };
}

export const appointmentsRoutes: FastifyPluginAsync<AppointmentsRoutesOptions> = (
  app,
  { service, guards },
) => {
  const clientOnly = [guards.requireAuth, guards.requireRole('CLIENT')];
  const checkCreateLimit = app.createRateLimit({
    max: CREATE_REQUESTS_PER_USER_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request) => `create-appointment|${currentUser(request).id}`,
  });

  app.post(
    '/',
    {
      preHandler: [
        ...clientOnly,
        async (request, reply) => {
          const limit = await checkCreateLimit(request);
          if (!limit.isAllowed && limit.isExceeded) {
            reply.header('retry-after', String(limit.ttlInSeconds));
            throw new RateLimitedError();
          }
        },
      ],
    },
    async (request, reply) => {
      const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
      const input = parseInput(createAppointmentSchema, request.body);
      const result = await service.create(requestContext(request), { idempotencyKey, input });
      if (result.replayed) reply.header(IDEMPOTENT_REPLAY_HEADER, 'true');
      // jsonb reorders object keys; re-parsing restores the field order, so a replay is byte-identical.
      return reply.code(result.status).send(appointmentSchema.parse(result.body));
    },
  );

  app.get('/', { preHandler: clientOnly }, async (request) => {
    const query = parseInput(clientAppointmentsQuerySchema, request.query);
    return appointmentPageSchema.parse(await service.listOwn(currentUser(request).id, query));
  });

  app.post('/:id/cancel', { preHandler: clientOnly }, async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return appointmentSchema.parse(await service.cancel(requestContext(request), id));
  });

  return Promise.resolve();
};
