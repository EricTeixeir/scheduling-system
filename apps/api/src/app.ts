import cookie from '@fastify/cookie';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { Config } from './config/env';
import type { Clock } from './domain/time/clock';
import { registerAuthGuards } from './http/auth-guards';
import { requireCsrfHeader } from './http/csrf';
import { handleError, replyNotFound } from './http/error-handler';
import { echoRequestId, generateRequestId } from './http/request-id';
import { registerSecurityPlugins } from './http/security-plugins';
import type { DatabaseClient } from './infra/db/prisma-client';
import type { AdminAppointmentRepository } from './modules/admin-appointments/admin-appointments.ports';
import {
  adminAppointmentsRoutes,
  adminClientsRoutes,
} from './modules/admin-appointments/admin-appointments.routes';
import { createAdminAppointmentsService } from './modules/admin-appointments/admin-appointments.service';
import type { AppointmentRepository } from './modules/appointments/appointments.ports';
import { appointmentsRoutes } from './modules/appointments/appointments.routes';
import {
  createAppointmentsService,
  createBooking,
} from './modules/appointments/appointments.service';
import { createAccessTokens } from './modules/auth/access-token';
import { readAccessTokenCookie } from './modules/auth/auth-cookies';
import type {
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from './modules/auth/auth.ports';
import { authRoutes } from './modules/auth/auth.routes';
import { createAuthService } from './modules/auth/auth.service';
import type { AvailabilityRepository } from './modules/availability/availability.ports';
import { availabilityRoutes } from './modules/availability/availability.routes';
import { createAvailabilityService } from './modules/availability/availability.service';
import type { ScheduleBlockRepository } from './modules/schedule-blocks/schedule-blocks.ports';
import { scheduleBlocksRoutes } from './modules/schedule-blocks/schedule-blocks.routes';
import { createScheduleBlocksService } from './modules/schedule-blocks/schedule-blocks.service';
import { healthRoutes } from './routes/health';

const CONNECTION_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface AppDependencies {
  readonly config: Config;
  readonly prisma: DatabaseClient;
  readonly logger: FastifyBaseLogger;
  readonly clock: Clock;
  readonly passwordHasher: PasswordHasher;
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly availability: AvailabilityRepository;
  readonly appointments: AppointmentRepository;
  readonly adminAppointments: AdminAppointmentRepository;
  readonly scheduleBlocks: ScheduleBlockRepository;
}

export async function buildApp({
  config,
  prisma,
  logger,
  clock,
  passwordHasher,
  users,
  refreshTokens,
  availability,
  appointments,
  adminAppointments,
  scheduleBlocks,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: generateRequestId,
    requestIdHeader: false,
    // Not `true` (any client could forge X-Forwarded-For and dodge the per-IP rate limit) and
    // not a hop count (Fastify 5.12 treats numbers as trust-nothing): only listed proxy addresses.
    trustProxy: config.trustedProxies.length > 0 ? [...config.trustedProxies] : false,
    bodyLimit: config.bodyLimitBytes,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    return503OnClosing: true,
    frameworkErrors: (error, request, reply) => {
      void handleError(error, request, reply);
    },
  });

  app.removeContentTypeParser('text/plain');
  app.addHook('onRequest', echoRequestId);
  app.setErrorHandler(handleError);
  await registerSecurityPlugins(app, config);
  app.addHook('onRequest', requireCsrfHeader);
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, replyNotFound);
  await app.register(cookie);

  const authService = createAuthService({
    users,
    refreshTokens,
    passwordHasher,
    accessTokens: createAccessTokens({ secret: config.jwtSecret, clock }),
    clock,
  });
  const guards = registerAuthGuards(app, async (request) => {
    const accessToken = readAccessTokenCookie(request);
    return accessToken === undefined ? undefined : authService.authenticate(accessToken);
  });

  await app.register(healthRoutes, { prefix: '/api', prisma });
  await app.register(authRoutes, {
    prefix: '/api/auth',
    service: authService,
    guards,
  });

  const businessRules = {
    clock,
    policy: config.bookingPolicy,
    timeZone: config.businessTimezone,
  };
  await app.register(availabilityRoutes, {
    prefix: '/api/availability',
    service: createAvailabilityService({ availability, ...businessRules }),
    guards,
  });
  const booking = { appointments, schedule: availability, ...businessRules };
  await app.register(appointmentsRoutes, {
    prefix: '/api/appointments',
    service: createAppointmentsService(booking),
    guards,
  });
  const adminService = createAdminAppointmentsService({
    appointments: adminAppointments,
    book: createBooking(booking),
    ...businessRules,
  });
  await app.register(adminAppointmentsRoutes, {
    prefix: '/api/admin/appointments',
    service: adminService,
    guards,
  });
  await app.register(adminClientsRoutes, {
    prefix: '/api/admin/clients',
    service: adminService,
    guards,
  });
  await app.register(scheduleBlocksRoutes, {
    prefix: '/api/admin/blocks',
    service: createScheduleBlocksService({ blocks: scheduleBlocks, ...businessRules }),
    guards,
  });

  return app;
}
