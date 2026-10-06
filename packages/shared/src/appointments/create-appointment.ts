import { z } from 'zod';

import { isoDateTimeSchema } from '../common/iso-date-time';

export const NOTES_MAX_LENGTH = 500;

export const appointmentNotesSchema = z
  .string({ error: 'As observações devem ser um texto.' })
  .trim()
  .max(NOTES_MAX_LENGTH, {
    error: `As observações devem ter no máximo ${String(NOTES_MAX_LENGTH)} caracteres.`,
  })
  .optional();

export const createAppointmentSchema = z
  .strictObject({
    startsAt: isoDateTimeSchema,
    notes: appointmentNotesSchema,
  })
  .transform(({ notes, ...rest }): { startsAt: string; notes?: string } =>
    notes ? { ...rest, notes } : rest,
  );

export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;
export type CreateAppointmentOutput = z.output<typeof createAppointmentSchema>;
