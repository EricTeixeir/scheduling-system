import { weekdayOf } from '../../domain/time/local-date';
import type { PrismaClient } from '../../infra/db/generated/client.js';
import type { AvailabilityRepository } from './availability.ports';

// Prisma reads TIME columns as a Date on 1970-01-01 whose UTC time is the stored wall-clock time.
function toHhMm(time: Date): string {
  const hours = String(time.getUTCHours()).padStart(2, '0');
  const minutes = String(time.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function createPrismaAvailabilityRepository(prisma: PrismaClient): AvailabilityRepository {
  return {
    async findDaySchedule(date) {
      const weekday = weekdayOf(date);
      const [rule, closed] = await Promise.all([
        prisma.availabilityRule.findUnique({ where: { weekday } }),
        prisma.closedDate.findUnique({
          where: { date: new Date(`${date}T00:00:00.000Z`) },
          select: { date: true },
        }),
      ]);
      return {
        hours:
          rule === null
            ? null
            : {
                weekday: rule.weekday,
                opensAt: toHhMm(rule.opensAt),
                closesAt: toHhMm(rule.closesAt),
                slotMinutes: rule.slotMinutes,
              },
        isClosedDate: closed !== null,
      };
    },

    findBusyRanges({ startsAt, endsAt }) {
      return prisma.appointment.findMany({
        where: {
          status: { not: 'CANCELLED' },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { startsAt: true, endsAt: true },
        orderBy: { startsAt: 'asc' },
      });
    },
  };
}
