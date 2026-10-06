import { z } from 'zod';

import { isoDateTimeSchema } from '../common/iso-date-time';
import { uuidSchema } from '../common/uuid';
import { ERROR_CODES } from './error-codes';

export const MAX_LISTED_CONFLICTS = 50;

export const scheduleConflictSchema = z.strictObject({
  appointmentId: uuidSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  clientName: z.string(),
});

// Strict, unlike other responses: an error body carrying anything else (e.g. a stack trace)
// must fail tests instead of being silently stripped.
export const problemDetailsSchema = z.strictObject({
  type: z.string().min(1),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.enum(ERROR_CODES).optional(),
  errors: z.array(z.strictObject({ path: z.string(), message: z.string() })).optional(),
  conflicts: z.array(scheduleConflictSchema).max(MAX_LISTED_CONFLICTS).optional(),
});

export type ProblemDetails = z.output<typeof problemDetailsSchema>;
export type FieldError = NonNullable<ProblemDetails['errors']>[number];
export type ScheduleConflict = z.output<typeof scheduleConflictSchema>;
