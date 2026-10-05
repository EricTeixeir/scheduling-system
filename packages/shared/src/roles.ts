/**
 * Every user role. Must match the database enum (a test in the api workspace
 * guards against drift).
 */
export const ROLES = ['CLIENT', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];
