import { z } from 'zod';

import { APPOINTMENT_STATUSES } from '../appointment-status';

export const appointmentStatusTargetSchema = z
  .enum(APPOINTMENT_STATUSES)
  .exclude(['CONFIRMED'], { error: 'Status inválido para esta alteração.' });

export const updateAppointmentStatusSchema = z.strictObject({
  status: appointmentStatusTargetSchema,
});

export type AppointmentStatusTarget = z.output<typeof appointmentStatusTargetSchema>;
export type UpdateAppointmentStatusInput = z.input<typeof updateAppointmentStatusSchema>;
export type UpdateAppointmentStatusOutput = z.output<typeof updateAppointmentStatusSchema>;
