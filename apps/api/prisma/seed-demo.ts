import { randomBytes, randomUUID } from 'node:crypto';

import { loadConfig } from '../src/config/env.js';
import { addMinutes } from '../src/domain/time/instant.js';
import {
  addLocalDays,
  localDateOf,
  weekdayOf,
  zonedInstant,
  type LocalDate,
} from '../src/domain/time/local-date.js';
import type { AppointmentStatus, PrismaClient } from '../src/infra/db/generated/client.js';
import { createPrismaClient } from '../src/infra/db/prisma-client.js';
import { createPasswordHasher } from '../src/modules/auth/password-hasher.js';

const DEMO_CLIENTS = [
  { name: 'Ana Souza', email: 'ana.souza@demo.test' },
  { name: 'Bruno Lima', email: 'bruno.lima@demo.test' },
  { name: 'Carla Mendes', email: 'carla.mendes@demo.test' },
  { name: 'Diego Rocha', email: 'diego.rocha@demo.test' },
  { name: 'Elisa Martins', email: 'elisa.martins@demo.test' },
  { name: 'Felipe Araújo', email: 'felipe.araujo@demo.test' },
] as const;

const PAST_DAYS = 30;
const FUTURE_DAYS = 14;
const REQUEST_ID = 'seed-demo';

interface Actor {
  readonly id: string;
  readonly role: 'CLIENT' | 'ADMIN';
}

interface DemoSlot {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly pick: number;
}

function pastStatus(pick: number): AppointmentStatus | null {
  if (pick <= 1) return 'COMPLETED';
  if (pick === 2) return 'NO_SHOW';
  if (pick === 3) return 'CANCELLED';
  return null;
}

function upcomingStatus(pick: number): AppointmentStatus | null {
  if (pick <= 2) return 'CONFIRMED';
  if (pick === 3) return 'CANCELLED';
  return null;
}

async function demoSlots(prisma: PrismaClient, today: LocalDate, timeZone: string) {
  const rules = await prisma.availabilityRule.findMany();
  const slots: DemoSlot[] = [];
  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
    const date = addLocalDays(today, offset);
    const rule = rules.find(({ weekday }) => weekday === weekdayOf(date));
    if (!rule) continue;
    const opens = rule.opensAt.getUTCHours() * 60 + rule.opensAt.getUTCMinutes();
    const closes = rule.closesAt.getUTCHours() * 60 + rule.closesAt.getUTCMinutes();
    for (let minute = opens; minute + rule.slotMinutes <= closes; minute += rule.slotMinutes) {
      const startsAt = zonedInstant(date, minute, timeZone);
      const position = offset * 7 + (minute / rule.slotMinutes) * 3;
      const pick = ((position % 10) + 10) % 10;
      slots.push({ startsAt, endsAt: addMinutes(startsAt, rule.slotMinutes), pick });
    }
  }
  return slots;
}

async function createDemoClients(prisma: PrismaClient): Promise<Actor[]> {
  const hasher = createPasswordHasher();
  const clients: Actor[] = [];
  for (const { name, email } of DEMO_CLIENTS) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    const user =
      existing ??
      (await prisma.user.create({
        data: { name, email, passwordHash: await hasher.hash(randomBytes(32).toString('hex')) },
        select: { id: true },
      }));
    clients.push({ id: user.id, role: 'CLIENT' });
  }
  return clients;
}

async function seedDemo(): Promise<void> {
  const config = loadConfig(process.env);
  const prisma = createPrismaClient(config.databaseUrl);
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    if (!admin) throw new Error('No admin account: run the base seed (npm run dev) first.');

    const clients = await createDemoClients(prisma);
    const alreadySeeded = await prisma.appointment.count({
      where: { userId: { in: clients.map(({ id }) => id) } },
    });
    if (alreadySeeded > 0) {
      console.log(
        `Demo clients already have ${String(alreadySeeded)} appointments: nothing to do.`,
      );
      return;
    }

    const now = new Date();
    const timeZone = config.businessTimezone;
    const slots = await demoSlots(prisma, localDateOf(now, timeZone), timeZone);
    const taken = await prisma.appointment.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startsAt: { lt: slots.at(-1)?.endsAt ?? now },
        endsAt: { gt: slots[0]?.startsAt ?? now },
      },
      select: { startsAt: true, endsAt: true },
    });
    const isFree = (slot: DemoSlot) =>
      !taken.some(({ startsAt, endsAt }) => startsAt < slot.endsAt && endsAt > slot.startsAt);

    const appointments = [];
    const events = [];
    for (const [index, slot] of slots.entries()) {
      const status = slot.startsAt <= now ? pastStatus(slot.pick) : upcomingStatus(slot.pick);
      if (status === null || !isFree(slot)) continue;
      const client = clients[index % clients.length] as Actor;
      const id = randomUUID();
      const createdAt = new Date(
        Math.min(now.getTime(), addMinutes(slot.startsAt, -3 * 24 * 60).getTime()),
      );
      appointments.push({
        id,
        userId: client.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status,
        notes: slot.pick === 0 ? 'Primeira consulta.' : null,
        createdAt,
      });
      const event = { entityType: 'APPOINTMENT', entityId: id, requestId: REQUEST_ID };
      events.push({
        ...event,
        occurredAt: createdAt,
        actorId: client.id,
        actorRole: client.role,
        action: 'APPOINTMENT_CREATED',
        fromStatus: null,
        toStatus: 'CONFIRMED',
        metadata: { startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() },
      });
      if (status !== 'CONFIRMED') {
        const cancelled = status === 'CANCELLED';
        events.push({
          ...event,
          occurredAt: cancelled ? addMinutes(createdAt, 60) : slot.endsAt,
          actorId: cancelled ? client.id : admin.id,
          actorRole: cancelled ? client.role : 'ADMIN',
          action: `APPOINTMENT_${status}`,
          fromStatus: 'CONFIRMED',
          toStatus: status,
        });
      }
    }

    await prisma.$transaction([
      prisma.appointment.createMany({ data: appointments }),
      prisma.auditEvent.createMany({ data: events }),
    ]);
    console.log(
      `Seeded ${String(appointments.length)} demo appointments for ${String(clients.length)} demo clients ` +
        `(last ${String(PAST_DAYS)} days to next ${String(FUTURE_DAYS)}). Demo clients cannot sign in.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await seedDemo();
