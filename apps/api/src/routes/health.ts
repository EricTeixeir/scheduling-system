import type { FastifyPluginCallback } from 'fastify';

import { ServiceUnavailableError } from '../errors/app-errors';
import type { DatabaseClient } from '../infra/db/prisma-client';

export const READY_TIMEOUT_MS = 2_000;

export interface HealthRoutesOptions {
  readonly prisma: DatabaseClient;
}

async function pingDatabase(prisma: DatabaseClient): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`database ping exceeded ${String(READY_TIMEOUT_MS)} ms`));
    }, READY_TIMEOUT_MS);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, { prisma }, done) => {
  app.get('/health', () => ({ status: 'ok' }));

  app.get('/health/ready', async (request) => {
    try {
      await pingDatabase(prisma);
    } catch (error) {
      request.log.warn({ err: error }, 'readiness check failed');
      throw new ServiceUnavailableError('O banco de dados não está acessível.');
    }
    return { status: 'ok' };
  });

  done();
};
