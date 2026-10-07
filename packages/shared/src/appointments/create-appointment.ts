import { z } from 'zod';

import { isoDateTimeSchema } from '../common/iso-date-time';

export const NOTES_MAX_LENGTH = 500;
export const MAX_APPOINTMENT_MINUTES = 180;

export const appointmentNotesSchema = z
  .string({ error: 'As observações devem ser um texto.' })
  .trim()
  .max(NOTES_MAX_LENGTH, {
    error: `As observações devem ter no máximo ${String(NOTES_MAX_LENGTH)} caracteres.`,
  })
  .optional();

export const appointmentDurationSchema = z
  .number({ error: 'A duração deve ser um número de minutos.' })
  .int({ error: 'A duração deve ser um número inteiro de minutos.' })
  .positive({ error: 'A duração deve ser maior que zero.' })
  .max(MAX_APPOINTMENT_MINUTES, {
    error: `A duração deve ser de no máximo ${String(MAX_APPOINTMENT_MINUTES)} minutos.`,
  })
  .optional();

export interface OptionalBookingFields {
  notes?: string;
  durationMinutes?: number;
}

export function presentBookingFields(
  notes: string | undefined,
  durationMinutes: number | undefined,
): OptionalBookingFields {
  return {
    ...(notes ? { notes } : {}),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  };
}

export const createAppointmentSchema = z
  .strictObject({
    startsAt: isoDateTimeSchema,
    notes: appointmentNotesSchema,
    durationMinutes: appointmentDurationSchema,
  })
  .transform(
    ({ startsAt, notes, durationMinutes }): { startsAt: string } & OptionalBookingFields => ({
      startsAt,
      ...presentBookingFields(notes, durationMinutes),
    }),
  );

export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;
export type CreateAppointmentOutput = z.output<typeof createAppointmentSchema>;
