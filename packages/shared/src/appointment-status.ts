/**
 * Every status an appointment can have. Appointments are confirmed on creation;
 * CANCELLED, COMPLETED and NO_SHOW are terminal. Must match the database enum
 * (a test in the api workspace guards against drift).
 */
export const APPOINTMENT_STATUSES = ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
