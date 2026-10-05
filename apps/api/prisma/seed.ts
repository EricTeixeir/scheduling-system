import { createPrismaClient } from '../src/infra/db/prisma-client.js';

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

async function seed(): Promise<void> {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
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
  } finally {
    await prisma.$disconnect();
  }
}

await seed();
