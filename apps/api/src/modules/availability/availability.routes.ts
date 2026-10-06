import { availabilityQuerySchema, availabilityResponseSchema } from '@scheduling/shared';
import type { FastifyPluginAsync } from 'fastify';

import type { AuthGuards } from '../../http/auth-guards';
import { parseInput } from '../../http/parse-input';
import type { AvailabilityService } from './availability.service';

export interface AvailabilityRoutesOptions {
  readonly service: AvailabilityService;
  readonly guards: AuthGuards;
}

export const availabilityRoutes: FastifyPluginAsync<AvailabilityRoutesOptions> = (
  app,
  { service, guards },
) => {
  app.get('/', { preHandler: guards.requireAuth }, async (request) => {
    const { date } = parseInput(availabilityQuerySchema, request.query);
    return availabilityResponseSchema.parse(await service.listSlots(date));
  });

  return Promise.resolve();
};
