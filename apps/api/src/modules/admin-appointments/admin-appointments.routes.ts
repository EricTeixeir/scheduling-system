import {
  adminAppointmentSchema,
  adminAppointmentsQuerySchema,
  adminCreateAppointmentSchema,
  adminSummarySchema,
  clientSearchQuerySchema,
  clientSearchResponseSchema,
  idParamsSchema,
  paginatedSchema,
  updateAppointmentStatusSchema,
} from '@scheduling/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { currentUser, type AuthGuards } from '../../http/auth-guards';
import { IDEMPOTENT_REPLAY_HEADER, parseIdempotencyKey } from '../../http/idempotency-key';
import { parseInput } from '../../http/parse-input';
import { bookingRateLimit, requestContext } from '../appointments/appointments.routes';
import type { AdminAppointmentsService } from './admin-appointments.service';

const adminAppointmentPageSchema = paginatedSchema(adminAppointmentSchema);

export interface AdminAppointmentsRoutesOptions {
  readonly service: AdminAppointmentsService;
  readonly guards: AuthGuards;
}

function requireAdmin(app: FastifyInstance, guards: AuthGuards): void {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole('ADMIN'));
}

export const adminAppointmentsRoutes: FastifyPluginAsync<AdminAppointmentsRoutesOptions> = (
  app,
  { service, guards },
) => {
  requireAdmin(app, guards);

  app.post('/', { preHandler: bookingRateLimit(app) }, async (request, reply) => {
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const input = parseInput(adminCreateAppointmentSchema, request.body);
    const result = await service.create(requestContext(request), { idempotencyKey, input });
    if (result.replayed) reply.header(IDEMPOTENT_REPLAY_HEADER, 'true');
    return reply.code(result.status).send(adminAppointmentSchema.parse(result.body));
  });

  app.get('/summary', async () => adminSummarySchema.parse(await service.summary()));

  app.get('/', async (request) => {
    const query = parseInput(adminAppointmentsQuerySchema, request.query);
    return adminAppointmentPageSchema.parse(await service.list(query));
  });

  app.post('/:id/status', async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    const { status } = parseInput(updateAppointmentStatusSchema, request.body);
    const { id: actorId, role } = currentUser(request);
    const updated = await service.updateStatus(
      { actor: { id: actorId, role }, requestId: request.id },
      id,
      status,
    );
    return adminAppointmentSchema.parse(updated);
  });

  app.get('/:id/history', async (request) => {
    const { id } = parseInput(idParamsSchema, request.params);
    return service.history(id);
  });

  return Promise.resolve();
};

export const adminClientsRoutes: FastifyPluginAsync<AdminAppointmentsRoutesOptions> = (
  app,
  { service, guards },
) => {
  requireAdmin(app, guards);

  app.get('/', async (request) => {
    const { q } = parseInput(clientSearchQuerySchema, request.query);
    return clientSearchResponseSchema.parse(await service.searchClients(q));
  });

  return Promise.resolve();
};
