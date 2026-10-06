import { uuidSchema } from '@scheduling/shared';

import { AppError } from '../errors/app-errors';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replayed';

const MISSING_KEY_DETAIL = `Envie o cabeçalho ${IDEMPOTENCY_KEY_HEADER} com um UUID novo para cada agendamento e repita o mesmo UUID só ao reenviar a mesma requisição.`;

export function parseIdempotencyKey(header: string | string[] | undefined): string {
  const result = uuidSchema.safeParse(header);
  if (result.success) return result.data.toLowerCase();
  throw new AppError(400, 'VALIDATION_FAILED', {
    detail: MISSING_KEY_DETAIL,
    errors: [
      {
        path: IDEMPOTENCY_KEY_HEADER,
        message: header === undefined ? 'Cabeçalho obrigatório.' : 'Informe um UUID válido.',
      },
    ],
  });
}
