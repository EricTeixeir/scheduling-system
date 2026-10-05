import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { Config } from './config/env';
import { requireCsrfHeader } from './http/csrf';
import { handleError, replyNotFound } from './http/error-handler';
import { echoRequestId, generateRequestId } from './http/request-id';
import { registerSecurityPlugins } from './http/security-plugins';
import type { DatabaseClient } from './infra/db/prisma-client';
import { healthRoutes } from './routes/health';

const CONNECTION_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface AppDependencies {
  readonly config: Config;
  readonly prisma: DatabaseClient;
  readonly logger: FastifyBaseLogger;
}

export async function buildApp({
  config,
  prisma,
  logger,
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

  await app.register(healthRoutes, { prefix: '/api', prisma });

  return app;
}
