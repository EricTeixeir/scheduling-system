import type { Prisma, PrismaClient } from '../../infra/db/generated/client.js';
import { mapPrismaError } from '../../infra/db/prisma-errors';
import { createPrismaAuditLog } from '../audit/audit.repository';
import type {
  AdminAppointmentRepository,
  AdminAppointmentsTransaction,
  AppointmentCriteria,
} from './admin-appointments.ports';

const CLIENT = { id: true, name: true, email: true } as const;

const RECORD = {
  id: true,
  userId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  createdAt: true,
  user: { select: CLIENT },
} as const;

type Row = Prisma.AppointmentGetPayload<{ select: typeof RECORD }>;

function toRecord({ user, ...appointment }: Row) {
  return { ...appointment, client: user };
}

// Prisma passes `contains` to LIKE unescaped: % and _ in the search would act as wildcards.
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function nameOrEmailContains(search: string): Prisma.UserWhereInput {
  const pattern = escapeLikePattern(search);
  return {
    OR: [
      { name: { contains: pattern, mode: 'insensitive' } },
      { email: { contains: pattern, mode: 'insensitive' } },
    ],
  };
}

function whereOf(criteria: AppointmentCriteria): Prisma.AppointmentWhereInput {
  const { status, startsFrom, startsBefore, search } = criteria;
  return {
    ...(status === undefined ? {} : { status }),
    ...(startsFrom === undefined && startsBefore === undefined
      ? {}
      : {
          startsAt: {
            ...(startsFrom === undefined ? {} : { gte: startsFrom }),
            ...(startsBefore === undefined ? {} : { lt: startsBefore }),
          },
        }),
    ...(search === undefined ? {} : { user: nameOrEmailContains(search) }),
  };
}

function createTransaction(tx: Prisma.TransactionClient): AdminAppointmentsTransaction {
  return {
    async setStatusIfConfirmed(id, status) {
      const { count } = await tx.appointment.updateMany({
        where: { id, status: 'CONFIRMED' },
        data: { status },
      });
      if (count !== 1) return undefined;
      return toRecord(await tx.appointment.findUniqueOrThrow({ where: { id }, select: RECORD }));
    },

    audit: createPrismaAuditLog(tx),
  };
}

export function createPrismaAdminAppointmentRepository(
  prisma: PrismaClient,
): AdminAppointmentRepository {
  return {
    async list(filter) {
      const where = whereOf(filter);
      const [rows, total] = await prisma.$transaction([
        prisma.appointment.findMany({
          where,
          select: RECORD,
          orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        }),
        prisma.appointment.count({ where }),
      ]);
      return { items: rows.map(toRecord), total };
    },

    count(criteria) {
      return prisma.appointment.count({ where: whereOf(criteria) });
    },

    async findById(id) {
      const found = await prisma.appointment.findUnique({ where: { id }, select: RECORD });
      return found === null ? undefined : toRecord(found);
    },

    listHistory(appointmentId) {
      return prisma.auditEvent
        .findMany({
          where: { entityType: 'APPOINTMENT', entityId: appointmentId },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            occurredAt: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            actorRole: true,
            actor: { select: { id: true, name: true } },
          },
        })
        .then((events) =>
          events.map(({ actorRole, actor, ...event }) => ({
            ...event,
            actor: { ...actor, role: actorRole },
          })),
        );
    },

    async findClient(id) {
      const found = await prisma.user.findFirst({ where: { id, role: 'CLIENT' }, select: CLIENT });
      return found ?? undefined;
    },

    searchClients(search, limit) {
      return prisma.user.findMany({
        where: { role: 'CLIENT', ...nameOrEmailContains(search) },
        select: CLIENT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
      });
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
