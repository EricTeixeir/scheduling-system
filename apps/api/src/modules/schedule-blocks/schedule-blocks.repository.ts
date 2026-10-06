import type { ScheduleBlock } from '../../domain/availability/schedule-block';
import {
  dateColumnToLocalDate,
  hhMmToTimeColumn,
  localDateToDateColumn,
  timeColumnToHhMm,
} from '../../infra/db/column-values';
import type { Prisma, PrismaClient } from '../../infra/db/generated/client.js';
import { mapPrismaError } from '../../infra/db/prisma-errors';
import { createPrismaAuditLog } from '../audit/audit.repository';
import type {
  ScheduleBlockRecord,
  ScheduleBlockRepository,
  ScheduleBlocksTransaction,
} from './schedule-blocks.ports';

export const BLOCK_COLUMNS = {
  weekdays: true,
  startTime: true,
  endTime: true,
  startsOn: true,
  endsOn: true,
} as const;

const RECORD = { ...BLOCK_COLUMNS, id: true, reason: true, createdBy: true, createdAt: true };

type BlockRow = Prisma.ScheduleBlockGetPayload<{ select: typeof BLOCK_COLUMNS }>;
type RecordRow = Prisma.ScheduleBlockGetPayload<{ select: typeof RECORD }>;

export function toScheduleBlock(row: BlockRow): ScheduleBlock {
  return {
    weekdays: row.weekdays,
    startTime: timeColumnToHhMm(row.startTime),
    endTime: timeColumnToHhMm(row.endTime),
    startsOn: dateColumnToLocalDate(row.startsOn),
    endsOn: row.endsOn === null ? null : dateColumnToLocalDate(row.endsOn),
  };
}

function toRecord(row: RecordRow): ScheduleBlockRecord {
  return {
    ...toScheduleBlock(row),
    id: row.id,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function createTransaction(tx: Prisma.TransactionClient): ScheduleBlocksTransaction {
  return {
    async insertBlock(block) {
      await tx.scheduleBlock.create({
        data: {
          id: block.id,
          weekdays: [...block.weekdays],
          startTime: hhMmToTimeColumn(block.startTime),
          endTime: hhMmToTimeColumn(block.endTime),
          startsOn: localDateToDateColumn(block.startsOn),
          endsOn: block.endsOn === null ? null : localDateToDateColumn(block.endsOn),
          reason: block.reason,
          createdBy: block.createdBy,
          createdAt: block.createdAt,
        },
        select: { id: true },
      });
    },

    // A concurrent delete of the same block finds count 0 here, so only one of them is audited.
    async deleteBlock(id) {
      const found = await tx.scheduleBlock.findUnique({ where: { id }, select: RECORD });
      if (found === null) return undefined;
      const { count } = await tx.scheduleBlock.deleteMany({ where: { id } });
      return count === 1 ? toRecord(found) : undefined;
    },

    audit: createPrismaAuditLog(tx),
  };
}

export function createPrismaScheduleBlockRepository(prisma: PrismaClient): ScheduleBlockRepository {
  return {
    async list() {
      const rows = await prisma.scheduleBlock.findMany({
        select: RECORD,
        orderBy: [{ startsOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toRecord);
    },

    async findConfirmedStartingBetween(after, until) {
      const rows = await prisma.appointment.findMany({
        where: { status: 'CONFIRMED', startsAt: { gt: after, lte: until } },
        select: { id: true, startsAt: true, endsAt: true, user: { select: { name: true } } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(({ user, ...appointment }) => ({ ...appointment, clientName: user.name }));
    },

    async transaction(work) {
      try {
        return await prisma.$transaction((tx) => work(createTransaction(tx)));
      } catch (error) {
        throw mapPrismaError(error, { onContention: 'CONFLICT' });
      }
    },
  };
}
