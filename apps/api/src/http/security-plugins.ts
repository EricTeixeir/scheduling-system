import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

import type { Config } from '../config/env';
import { RateLimitedError } from '../errors/app-errors';
import { CSRF_HEADER } from './csrf';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAY_HEADER } from './idempotency-key';
import { REQUEST_ID_HEADER } from './request-id';

export async function registerSecurityPlugins(app: FastifyInstance, config: Config): Promise<void> {
  await app.register(helmet, {
    // The API only serves JSON: a deny-all policy keeps a response from ever running as a page.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });

  await app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', CSRF_HEADER, IDEMPOTENCY_KEY_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After', IDEMPOTENT_REPLAY_HEADER],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new RateLimitedError(),
  });
}
