// Must match the database enum (guarded by apps/api/src/infra/db/enums-contract.test.ts).
export const APPOINTMENT_STATUSES = ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
