import { loadConfig } from '../src/config/env.js';
import type { PrismaClient } from '../src/infra/db/generated/client.js';
import { createPrismaClient } from '../src/infra/db/prisma-client.js';
import { DEMO_USERS } from '../src/modules/auth/demo-accounts.js';
import { createPasswordHasher } from '../src/modules/auth/password-hasher.js';

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

// Create-if-missing only: an existing account (even one with a demo email) keeps its password.
async function seedDemoUsers(prisma: PrismaClient): Promise<void> {
  const hasher = createPasswordHasher();
  let created = 0;
  for (const { name, email, password, role } of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing !== null) continue;
    await prisma.user.create({
      data: { name, email, role, passwordHash: await hasher.hash(password) },
    });
    created += 1;
  }
  console.log(
    `Demo users: ${String(created)} created, ${String(DEMO_USERS.length - created)} already present.`,
  );
}

async function seed(): Promise<void> {
  const config = loadConfig(process.env);
  const prisma = createPrismaClient(config.databaseUrl);
  try {
    await seedAvailability(prisma);
    if (config.demoMode) {
      await seedDemoUsers(prisma);
    } else {
      console.log('DEMO_MODE is off: demo users skipped.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
