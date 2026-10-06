import type { Prisma } from '../../infra/db/generated/client.js';
import type { AuditLog } from './audit.ports';

export function createPrismaAuditLog(tx: Prisma.TransactionClient): AuditLog {
  return {
    async append({ metadata, ...event }) {
      await tx.auditEvent.create({
        data: { ...event, ...(metadata === null ? {} : { metadata }) },
        select: { id: true },
      });
    },
  };
}
