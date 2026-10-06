import { z } from 'zod';

import { appointmentNotesSchema } from '../appointments/create-appointment';
import { isoDateTimeSchema } from '../common/iso-date-time';
import { uuidSchema } from '../common/uuid';

export const adminCreateAppointmentSchema = z
  .strictObject({
    clientId: uuidSchema,
    startsAt: isoDateTimeSchema,
    notes: appointmentNotesSchema,
  })
  .transform(({ notes, ...rest }): { clientId: string; startsAt: string; notes?: string } =>
    notes ? { ...rest, notes } : rest,
  );

export type AdminCreateAppointmentInput = z.input<typeof adminCreateAppointmentSchema>;
export type AdminCreateAppointmentOutput = z.output<typeof adminCreateAppointmentSchema>;
