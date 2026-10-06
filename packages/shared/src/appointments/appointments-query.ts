import { z } from 'zod';

import { APPOINTMENT_STATUSES } from '../appointment-status';
import { localDateSchema } from '../common/local-date';
import { paginationQuerySchema } from '../common/pagination';

export const SEARCH_MAX_LENGTH = 100;

const adminFiltersSchema = paginationQuerySchema
  .extend({
    status: z.enum(APPOINTMENT_STATUSES, { error: 'Status inválido.' }).optional(),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    q: z
      .string({ error: 'A busca deve ser um texto.' })
      .trim()
      .max(SEARCH_MAX_LENGTH, {
        error: `A busca deve ter no máximo ${String(SEARCH_MAX_LENGTH)} caracteres.`,
      })
      .optional(),
  })
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
    error: 'A data final deve ser igual ou posterior à data inicial.',
    path: ['to'],
  });

type AdminFilters = Omit<z.output<typeof adminFiltersSchema>, 'q'> & { q?: string };

// `q` matches the client's name or e-mail; a blank search means no search.
export const adminAppointmentsQuerySchema = adminFiltersSchema.transform(
  ({ q, ...rest }): AdminFilters => (q ? { ...rest, q } : rest),
);

export const APPOINTMENT_SCOPES = ['upcoming', 'past'] as const;

export const clientAppointmentsQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(APPOINTMENT_SCOPES, { error: 'Filtro inválido.' }).default('upcoming'),
});

export type AppointmentScope = (typeof APPOINTMENT_SCOPES)[number];
export type AdminAppointmentsQueryInput = z.input<typeof adminAppointmentsQuerySchema>;
export type AdminAppointmentsQueryOutput = z.output<typeof adminAppointmentsQuerySchema>;
export type ClientAppointmentsQueryInput = z.input<typeof clientAppointmentsQuerySchema>;
export type ClientAppointmentsQueryOutput = z.output<typeof clientAppointmentsQuerySchema>;
