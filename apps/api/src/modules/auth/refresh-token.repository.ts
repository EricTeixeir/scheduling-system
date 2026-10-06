import type { PrismaClient } from '../../infra/db/generated/client.js';
import type { RefreshTokenRepository } from './auth.ports';

export function createPrismaRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    async createFamily({ userId, expiresAt, tokenHash }) {
      await prisma.refreshTokenFamily.create({
        data: { userId, expiresAt, tokens: { create: { tokenHash } } },
        select: { id: true },
      });
    },

    async findByHash(tokenHash) {
      const row = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          familyId: true,
          revokedAt: true,
          rotatedAt: true,
          family: { select: { userId: true, expiresAt: true, revokedAt: true } },
        },
      });
      if (row === null) return undefined;
      return {
        id: row.id,
        familyId: row.familyId,
        userId: row.family.userId,
        revokedAt: row.revokedAt,
        rotatedAt: row.rotatedAt,
        familyExpiresAt: row.family.expiresAt,
        familyRevokedAt: row.family.revokedAt,
      };
    },

    rotateIfActive({ tokenId, familyId, nextTokenHash, now }) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.refreshToken.updateMany({
          where: { id: tokenId, revokedAt: null },
          data: { revokedAt: now, rotatedAt: now },
        });
        if (count !== 1) return false;
        await tx.refreshToken.create({ data: { familyId, tokenHash: nextTokenHash } });
        return true;
      });
    },

    async revokeFamily(familyId, now) {
      await prisma.$transaction([
        prisma.refreshTokenFamily.updateMany({
          where: { id: familyId, revokedAt: null },
          data: { revokedAt: now },
        }),
        prisma.refreshToken.updateMany({
          where: { familyId, revokedAt: null },
          data: { revokedAt: now },
        }),
      ]);
    },
  };
}
