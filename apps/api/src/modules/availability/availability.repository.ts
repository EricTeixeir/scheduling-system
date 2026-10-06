import { weekdayOf } from '../../domain/time/local-date';
import { localDateToDateColumn, timeColumnToHhMm } from '../../infra/db/column-values';
import type { PrismaClient } from '../../infra/db/generated/client.js';
import { BLOCK_COLUMNS, toScheduleBlock } from '../schedule-blocks/schedule-blocks.repository';
import type { AvailabilityRepository } from './availability.ports';

export function createPrismaAvailabilityRepository(prisma: PrismaClient): AvailabilityRepository {
  return {
    async findDaySchedule(date) {
      const weekday = weekdayOf(date);
      const day = localDateToDateColumn(date);
      const [rule, closed, blocks] = await Promise.all([
        prisma.availabilityRule.findUnique({ where: { weekday } }),
        prisma.closedDate.findUnique({ where: { date: day }, select: { date: true } }),
        prisma.scheduleBlock.findMany({
          where: {
            weekdays: { has: weekday },
            startsOn: { lte: day },
            OR: [{ endsOn: null }, { endsOn: { gte: day } }],
          },
          select: BLOCK_COLUMNS,
        }),
      ]);
      return {
        hours:
          rule === null
            ? null
            : {
                weekday: rule.weekday,
                opensAt: timeColumnToHhMm(rule.opensAt),
                closesAt: timeColumnToHhMm(rule.closesAt),
                slotMinutes: rule.slotMinutes,
              },
        isClosedDate: closed !== null,
        blocks: blocks.map(toScheduleBlock),
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
