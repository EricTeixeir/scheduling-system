import { z } from 'zod';

import { APPOINTMENT_STATUSES } from '../appointment-status';
import { isoDateTimeSchema } from '../common/iso-date-time';
import { uuidSchema } from '../common/uuid';

// Response schemas strip unknown keys instead of rejecting them, so the web keeps working
// when the API adds a field. Request schemas stay strict.
export const appointmentSchema = z.object({
  id: uuidSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: z.enum(APPOINTMENT_STATUSES),
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export const adminAppointmentSchema = appointmentSchema.extend({
  client: z.object({
    id: uuidSchema,
    name: z.string(),
    email: z.email(),
  }),
});

export type Appointment = z.output<typeof appointmentSchema>;
export type AdminAppointment = z.output<typeof adminAppointmentSchema>;
