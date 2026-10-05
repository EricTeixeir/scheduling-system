import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { loadConfig, type Config } from '../config/env';
import type { DatabaseClient } from '../infra/db/prisma-client';
import { createLogger } from '../logging/logger';

export const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://scheduling:test-password@localhost:5432/scheduling',
};

export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({ ...TEST_ENV, ...overrides });
}

export const healthyDatabase: DatabaseClient = {
  $queryRaw: () => Promise.resolve([{ '?column?': 1 }]),
};

export interface TestAppOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly prisma?: DatabaseClient;
}

export function buildTestApp({ env, prisma }: TestAppOptions = {}): Promise<FastifyInstance> {
  const config = testConfig(env);
  return buildApp({
    config,
    prisma: prisma ?? healthyDatabase,
    logger: createLogger(config.logLevel),
  });
}
