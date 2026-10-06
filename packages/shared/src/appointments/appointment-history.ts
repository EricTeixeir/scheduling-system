import { z } from 'zod';

import { APPOINTMENT_STATUSES } from '../appointment-status';
import { isoDateTimeSchema } from '../common/iso-date-time';
import { uuidSchema } from '../common/uuid';
import { ROLES } from '../roles';

export const APPOINTMENT_HISTORY_ACTIONS = [
  'APPOINTMENT_CREATED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_COMPLETED',
  'APPOINTMENT_NO_SHOW',
] as const;

// actor.role is the role at the time of the action, not the user's current role.
export const appointmentHistoryEntrySchema = z.object({
  id: uuidSchema,
  occurredAt: isoDateTimeSchema,
  action: z.enum(APPOINTMENT_HISTORY_ACTIONS),
  fromStatus: z.enum(APPOINTMENT_STATUSES).nullable(),
  toStatus: z.enum(APPOINTMENT_STATUSES).nullable(),
  actor: z.object({ id: uuidSchema, name: z.string(), role: z.enum(ROLES) }),
});

export const appointmentHistorySchema = z.object({
  items: z.array(appointmentHistoryEntrySchema),
});

export type AppointmentHistoryAction = (typeof APPOINTMENT_HISTORY_ACTIONS)[number];
export type AppointmentHistoryEntry = z.output<typeof appointmentHistoryEntrySchema>;
export type AppointmentHistory = z.output<typeof appointmentHistorySchema>;
