import {
  createScheduleBlockSchema,
  idParamsSchema,
  scheduleBlockListSchema,
  scheduleBlockSchema,
} from '@scheduling/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

import { currentUser, type AuthGuards } from '../../http/auth-guards';
import { parseInput } from '../../http/parse-input';
import type { RequestContext } from '../appointments/appointments.service';
import type { ScheduleBlocksService } from './schedule-blocks.service';

export interface ScheduleBlocksRoutesOptions {
  readonly service: ScheduleBlocksService;
  readonly guards: AuthGuards;
}

function requestContext(request: FastifyRequest): RequestContext {
  const { id, role } = currentUser(request);
  return { actor: { id, role }, requestId: request.id };
}

export const scheduleBlocksRoutes: FastifyPluginAsync<ScheduleBlocksRoutesOptions> = (
  app,
  { service, guards },
) => {
  app.addHook('preHandler', guards.requireAuth);
  app.addHook('preHandler', guards.requireRole('ADMIN'));

  app.get('/', async () => scheduleBlockListSchema.parse({ items: await service.list() }));

  app.post('/', async (request, reply) => {
    const input = parseInput(createScheduleBlockSchema, request.body);
    const block = await service.create(requestContext(request), input);
    return reply.code(201).send(scheduleBlockSchema.parse(block));
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = parseInput(idParamsSchema, request.params);
    await service.removeIfExists(requestContext(request), id);
    return reply.code(204).send();
  });

  return Promise.resolve();
};
