import { describe, expect, it } from 'vitest';

import { createPrismaClient } from './prisma-client';

describe('createPrismaClient', () => {
  it('refuses a blank connection string', () => {
    expect(() => createPrismaClient('  ')).toThrow('DATABASE_URL must be set');
  });

  it('creates a client without connecting', async () => {
    const prisma = createPrismaClient('postgresql://user:pass@127.0.0.1:1/db');
    expect(typeof prisma.$queryRaw).toBe('function');
    await prisma.$disconnect();
  });
});
