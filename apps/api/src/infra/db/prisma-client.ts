import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

const CONNECT_TIMEOUT_MS = 5_000;

export interface DatabaseClient {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): PromiseLike<unknown>;
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL must be set to connect to PostgreSQL');
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    }),
  });
}
