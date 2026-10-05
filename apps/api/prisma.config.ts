import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env by itself. The root .env is optional:
// in containers the variables come from the environment.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
try {
  process.loadEnvFile(rootEnvFile);
} catch (error) {
  const isMissingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';
  if (!isMissingFile) throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not env(): that throws when unset, and `prisma generate` must work without a database.
    url: process.env.DATABASE_URL ?? '',
  },
});
