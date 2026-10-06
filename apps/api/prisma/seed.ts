import { loadConfig } from '../src/config/env.js';
import type { PrismaClient } from '../src/infra/db/generated/client.js';
import { createPrismaClient } from '../src/infra/db/prisma-client.js';
import { createPasswordHasher } from '../src/modules/auth/password-hasher.js';
import { planSeedAccounts, type SeedAccount } from '../src/modules/auth/seed-accounts.js';

interface WeeklyHours {
  weekday: number;
  opensAt: string;
  closesAt: string;
}

const SLOT_MINUTES = 30;

// Sunday (0) has no row, which means closed.
const WEEKLY_HOURS: readonly WeeklyHours[] = [
  { weekday: 1, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 2, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 3, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 4, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 5, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 6, opensAt: '09:00', closesAt: '13:00' },
];

// Prisma represents TIME columns as a Date on 1970-01-01 and keeps only the
// UTC time part, so the wall-clock value must be written as UTC here.
function timeOfDay(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

async function seedAvailability(prisma: PrismaClient): Promise<void> {
  for (const { weekday, opensAt, closesAt } of WEEKLY_HOURS) {
    const hours = {
      opensAt: timeOfDay(opensAt),
      closesAt: timeOfDay(closesAt),
      slotMinutes: SLOT_MINUTES,
    };
    await prisma.availabilityRule.upsert({
      where: { weekday },
      create: { weekday, ...hours },
      update: hours,
    });
  }
  console.log(`Seeded ${String(WEEKLY_HOURS.length)} availability rules.`);
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
