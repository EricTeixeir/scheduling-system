// Must match the database enum (guarded by apps/api/src/infra/db/enums-contract.test.ts).
export const ROLES = ['CLIENT', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];
