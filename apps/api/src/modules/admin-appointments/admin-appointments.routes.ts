import {
  adminAppointmentSchema,
  adminAppointmentsQuerySchema,
  idParamsSchema,
  paginatedSchema,
  updateAppointmentStatusSchema,
} from '@scheduling/shared';
import type { FastifyPluginAsync } from 'fastify';

import { currentUser, type AuthGuards } from '../../http/auth-guards';
import { parseInput } from '../../http/parse-input';
import type { AdminAppointmentsService } from './admin-appointments.service';

const adminAppointmentPageSchema = paginatedSchema(adminAppointmentSchema);

export interface AdminAppointmentsRoutesOptions {
  readonly service: AdminAppointmentsService;
  readonly guards: AuthGuards;
}

export const adminAppointmentsRoutes: FastifyPluginAsync<AdminAppointmentsRoutesOptions> = (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole('ADMIN'));

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
