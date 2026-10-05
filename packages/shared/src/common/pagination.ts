import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;
// Deep offsets make the database skip that many rows; nobody pages this far by hand.
export const MAX_PAGE = 1000;

const NOT_A_WHOLE_NUMBER = 'Informe um número inteiro.';

// Query strings arrive as text. z.coerce.number() would accept '', ' 1', '1e1' and '0x10',
// so only plain digit strings (or real numbers) are converted.
function wholeNumber(bounds: z.ZodInt) {
  return z
    .union([z.number(), z.string().regex(/^\d+$/).transform(Number)], {
      error: NOT_A_WHOLE_NUMBER,
    })
    .pipe(bounds);
}

export const paginationQuerySchema = z.strictObject({
  page: wholeNumber(
    z
      .int({ error: NOT_A_WHOLE_NUMBER })
      .min(1, { error: 'A página deve ser no mínimo 1.' })
      .max(MAX_PAGE, { error: `A página deve ser no máximo ${String(MAX_PAGE)}.` }),
  ).default(1),
  pageSize: wholeNumber(
    z
      .int({ error: NOT_A_WHOLE_NUMBER })
      .min(1, { error: 'O tamanho da página deve ser no mínimo 1.' })
      .max(MAX_PAGE_SIZE, {
        error: `O tamanho da página deve ser no máximo ${String(MAX_PAGE_SIZE)}.`,
      }),
  ).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationQueryOutput = z.output<typeof paginationQuerySchema>;
