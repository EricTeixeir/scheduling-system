import { buildApp } from './app';
import { ConfigError, loadConfig } from './config/env';
import { systemClock } from './domain/time/clock';
import { createPrismaClient } from './infra/db/prisma-client';
import { createLogger } from './logging/logger';
import { createPrismaAdminAppointmentRepository } from './modules/admin-appointments/admin-appointments.repository';
import { createPrismaAppointmentRepository } from './modules/appointments/appointments.repository';
import { createPasswordHasher } from './modules/auth/password-hasher';
import { createPrismaRefreshTokenRepository } from './modules/auth/refresh-token.repository';
import { createPrismaUserRepository } from './modules/auth/user.repository';
import { createPrismaAvailabilityRepository } from './modules/availability/availability.repository';
import { createPrismaScheduleBlockRepository } from './modules/schedule-blocks/schedule-blocks.repository';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const prisma = createPrismaClient(config.databaseUrl);
  const app = await buildApp({
    config,
    prisma,
    logger,
    clock: systemClock,
    passwordHasher: createPasswordHasher(),
    users: createPrismaUserRepository(prisma),
    refreshTokens: createPrismaRefreshTokenRepository(prisma),
    availability: createPrismaAvailabilityRepository(prisma),
    appointments: createPrismaAppointmentRepository(prisma),
    adminAppointments: createPrismaAdminAppointmentRepository(prisma),
    scheduleBlocks: createPrismaScheduleBlockRepository(prisma),
  });

  let shuttingDown = false;
  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
    try {
      await app.close();
      await prisma.$disconnect();
    } catch (error) {
      logger.error({ err: error }, 'graceful shutdown failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExit);
    }
  }
  process.once('SIGTERM', (signal) => void shutdown(signal));
  process.once('SIGINT', (signal) => void shutdown(signal));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    logger.fatal({ err: error }, 'failed to start the server');
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
