import { loadConfig } from '../src/config/env.js';
import type { PrismaClient } from '../src/infra/db/generated/client.js';
import { createPrismaClient } from '../src/infra/db/prisma-client.js';
import { createPasswordHasher } from '../src/modules/auth/password-hasher.js';
import { planSeedAccounts, type SeedAccount } from '../src/modules/auth/seed-accounts.js';
import { SEED_SLOT_MINUTES, SEED_WEEKLY_HOURS } from './seed-schedule.js';

// Prisma represents TIME columns as a Date on 1970-01-01 and keeps only the
// UTC time part, so the wall-clock value must be written as UTC here.
function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

async function seedAvailability(prisma: PrismaClient): Promise<void> {
  for (const { weekday, opensAt, closesAt } of SEED_WEEKLY_HOURS) {
    const hours = {
      opensAt: timeOfDay(opensAt),
      closesAt: timeOfDay(closesAt),
      slotMinutes: SEED_SLOT_MINUTES,
    };
    await prisma.availabilityRule.upsert({
      where: { weekday },
      create: { weekday, ...hours },
      update: hours,
    });
  }
  console.log(`Seeded ${String(SEED_WEEKLY_HOURS.length)} availability rules.`);
}

// Create-if-missing only: an existing account keeps its password and role.
async function seedAccounts(prisma: PrismaClient, accounts: readonly SeedAccount[]): Promise<void> {
  const hasher = createPasswordHasher();
  for (const { name, email, password, role } of accounts) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing !== null) {
      console.log(`${role} account ${email} already exists: left unchanged.`);
      continue;
    }
    await prisma.user.create({
      data: { name, email, role, passwordHash: await hasher.hash(password) },
    });
    console.log(`${role} account ${email} created.`);
  }
}

async function seed(): Promise<void> {
  const config = loadConfig(process.env);
  const plan = planSeedAccounts(process.env);
  const prisma = createPrismaClient(config.databaseUrl);
  try {
    await seedAvailability(prisma);
    for (const role of plan.skipped) {
      console.log(`SEED_${role}_EMAIL / SEED_${role}_PASSWORD not set: ${role} account skipped.`);
    }
    await seedAccounts(prisma, plan.accounts);
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
