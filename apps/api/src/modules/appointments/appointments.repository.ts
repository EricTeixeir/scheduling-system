import type { Prisma, PrismaClient } from '../../infra/db/generated/client.js';
import { isUniqueViolation, mapPrismaError } from '../../infra/db/prisma-errors';
import { createPrismaAuditLog } from '../audit/audit.repository';
import type { AppointmentRepository, AppointmentsTransaction } from './appointments.ports';
import { IdempotencyKeyTakenError } from './idempotency';

const RECORD = {
  id: true,
  userId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  createdAt: true,
} as const;

function createTransaction(tx: Prisma.TransactionClient): AppointmentsTransaction {
  return {
    async claimIdempotencyKey({ userId, key, requestHash, response, createdAt }, expiredBefore) {
      await tx.idempotencyKey.deleteMany({
        where: { userId, key, createdAt: { lt: expiredBefore } },
      });
      try {
        await tx.idempotencyKey.create({
          data: {
            userId,
            key,
            requestHash,
            responseStatus: response.status,
            responseBody: response.body as Prisma.InputJsonValue,
            createdAt,
          },
          select: { key: true },
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new IdempotencyKeyTakenError();
        throw error;
      }
    },

    async insertAppointment(appointment) {
      await tx.appointment.create({ data: appointment, select: { id: true } });
    },

    async cancelIfConfirmed(id, userId) {
      const { count } = await tx.appointment.updateMany({
        where: { id, userId, status: 'CONFIRMED' },
        data: { status: 'CANCELLED' },
      });
      if (count !== 1) return undefined;
      return tx.appointment.findUniqueOrThrow({ where: { id }, select: RECORD });
    },

    audit: createPrismaAuditLog(tx),
  };
}

export function createPrismaAppointmentRepository(prisma: PrismaClient): AppointmentRepository {
  return {
    async findOwned(id, userId) {
      const found = await prisma.appointment.findFirst({ where: { id, userId }, select: RECORD });
      return found ?? undefined;
    },

    async listOwned({ userId, scope, now, page, pageSize }) {
      const where: Prisma.AppointmentWhereInput =
        scope === 'upcoming'
          ? { userId, startsAt: { gte: now } }
          : { userId, startsAt: { lt: now } };
      const [items, total] = await prisma.$transaction([
        prisma.appointment.findMany({
          where,
          select: RECORD,
          orderBy: [{ startsAt: scope === 'upcoming' ? 'asc' : 'desc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.appointment.count({ where }),
      ]);
      return { items, total };
    },

    async findIdempotencyRecord(userId, key, createdAfter) {
      const found = await prisma.idempotencyKey.findFirst({
        where: { userId, key, createdAt: { gte: createdAfter } },
        select: { requestHash: true, responseStatus: true, responseBody: true },
      });
      if (found === null) return undefined;
      return {
        requestHash: found.requestHash,
        response: { status: found.responseStatus, body: found.responseBody },
      };
    },

    async transaction(work, { onContention }) {
      try {
        return await prisma.$transaction((tx) => work(createTransaction(tx)));
      } catch (error) {
        if (error instanceof IdempotencyKeyTakenError) throw error;
        throw mapPrismaError(error, { onContention });
      }
    },
  };
}
