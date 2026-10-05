import { buildApp } from './app';
import { ConfigError, loadConfig } from './config/env';
import { createPrismaClient } from './infra/db/prisma-client';
import { createLogger } from './logging/logger';

const SHUTDOWN_GRACE_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel);
  const prisma = createPrismaClient(config.databaseUrl);
  const app = await buildApp({ config, prisma, logger });

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
