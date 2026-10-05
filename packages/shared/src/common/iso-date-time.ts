import { z } from 'zod';

export const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: 'Data e hora inválidas. Informe o fuso horário (ex.: 2026-10-07T14:00:00-03:00).',
});
