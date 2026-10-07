import { z } from 'zod';

import { SEARCH_MAX_LENGTH } from '../appointments/appointments-query';
import { uuidSchema } from '../common/uuid';

export const CLIENT_SEARCH_LIMIT = 10;

export const clientSearchQuerySchema = z.strictObject({
  q: z
    .string({ error: 'A busca deve ser um texto.' })
    .trim()
    .min(1, { error: 'Digite parte do nome ou do e-mail.' })
    .max(SEARCH_MAX_LENGTH, {
      error: `A busca deve ter no máximo ${String(SEARCH_MAX_LENGTH)} caracteres.`,
    }),
});

export const clientSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.email(),
});

export const clientSearchResponseSchema = z.object({
  items: z.array(clientSummarySchema).max(CLIENT_SEARCH_LIMIT),
});

export type ClientSearchQueryInput = z.input<typeof clientSearchQuerySchema>;
export type ClientSummary = z.output<typeof clientSummarySchema>;
export type ClientSearchResponse = z.output<typeof clientSearchResponseSchema>;
