import { z } from 'zod';

import { ValidationError } from '../errors/app-errors';

const ptBR = z.locales.ptBR();

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input, { error: ptBR.localeError });
  if (result.success) return result.data;
  throw new ValidationError(
    result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}
