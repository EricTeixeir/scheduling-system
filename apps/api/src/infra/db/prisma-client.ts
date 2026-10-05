import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL must be set to connect to PostgreSQL');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
