import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { loadConfig, type Config } from '../config/env';
import type { Clock } from '../domain/time/clock';
import type { DatabaseClient } from '../infra/db/prisma-client';
import { createLogger } from '../logging/logger';
import type { PasswordHasher } from '../modules/auth/auth.ports';
import { createFakeClock } from './fake-clock';
import {
  cheapestArgon2idHasher,
  createInMemoryRefreshTokenRepository,
  createInMemoryUserRepository,
  type InMemoryRefreshTokenRepository,
  type InMemoryUserRepository,
} from './in-memory-auth';

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
  readonly logger?: FastifyBaseLogger;
  readonly clock?: Clock;
  readonly passwordHasher?: PasswordHasher;
  readonly users?: InMemoryUserRepository;
  readonly refreshTokens?: InMemoryRefreshTokenRepository;
}

export function buildTestApp({
  env,
  prisma,
  logger,
  clock,
  passwordHasher,
  users,
  refreshTokens,
}: TestAppOptions = {}): Promise<FastifyInstance> {
  const config = testConfig(env);
  return buildApp({
    config,
    prisma: prisma ?? healthyDatabase,
    logger: logger ?? createLogger(config.logLevel),
    clock: clock ?? createFakeClock(),
    passwordHasher: passwordHasher ?? cheapestArgon2idHasher,
    users: users ?? createInMemoryUserRepository(),
    refreshTokens: refreshTokens ?? createInMemoryRefreshTokenRepository(),
  });
}
