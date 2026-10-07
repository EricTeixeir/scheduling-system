import { z } from 'zod';

import {
  appointmentDurationSchema,
  appointmentNotesSchema,
  presentBookingFields,
  type OptionalBookingFields,
} from '../appointments/create-appointment';
import { isoDateTimeSchema } from '../common/iso-date-time';
import { uuidSchema } from '../common/uuid';

export const adminCreateAppointmentSchema = z
  .strictObject({
    clientId: uuidSchema,
    startsAt: isoDateTimeSchema,
    notes: appointmentNotesSchema,
    durationMinutes: appointmentDurationSchema,
  })
  .transform(
    ({
      clientId,
      startsAt,
      notes,
      durationMinutes,
    }): { clientId: string; startsAt: string } & OptionalBookingFields => ({
      clientId,
      startsAt,
      ...presentBookingFields(notes, durationMinutes),
    }),
  );

export type AdminCreateAppointmentInput = z.input<typeof adminCreateAppointmentSchema>;
export type AdminCreateAppointmentOutput = z.output<typeof adminCreateAppointmentSchema>;
