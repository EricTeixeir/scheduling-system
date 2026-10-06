import type { PrismaClient } from '../../infra/db/generated/client.js';
import { isUniqueViolation, mapPrismaError } from '../../infra/db/prisma-errors';
import type { UserRepository } from './auth.ports';

const PROFILE = { id: true, name: true, email: true, role: true } as const;

export function createPrismaUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findCredentialsByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...PROFILE, passwordHash: true, failedLoginCount: true, lockedUntil: true },
      });
      return user ?? undefined;
    },

    async findProfileById(id) {
      const user = await prisma.user.findUnique({ where: { id }, select: PROFILE });
      return user ?? undefined;
    },

    async insertIfEmailFree(user) {
      try {
        return await prisma.user.create({ data: user, select: PROFILE });
      } catch (error) {
        if (isUniqueViolation(error)) return undefined;
        throw mapPrismaError(error);
      }
    },

    async incrementFailedLogins(id) {
      const { failedLoginCount } = await prisma.user.update({
        where: { id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      return failedLoginCount;
    },

    async extendLockUntil(id, until) {
      await prisma.user.updateMany({
        where: { id, OR: [{ lockedUntil: null }, { lockedUntil: { lt: until } }] },
        data: { lockedUntil: until },
      });
    },

    async resetFailedLogins(id) {
      await prisma.user.update({
        where: { id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    },
  };
}
