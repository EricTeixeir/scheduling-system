import { z } from 'zod';

import { localDateSchema } from '../common/local-date';
import { timeOfDaySchema } from '../common/time-of-day';

export const BLOCK_REASON_MAX_LENGTH = 200;

const weekdaySchema = z
  .int({ error: 'Dia da semana inválido.' })
  .min(0, { error: 'Dia da semana inválido.' })
  .max(6, { error: 'Dia da semana inválido.' });

const blockFieldsSchema = z
  .strictObject({
    // 0 = Sunday ... 6 = Saturday.
    weekdays: z
      .array(weekdaySchema, { error: 'Informe os dias da semana.' })
      .min(1, { error: 'Escolha pelo menos um dia da semana.' })
      .max(7, { error: 'Escolha no máximo 7 dias da semana.' })
      .refine((days) => new Set(days).size === days.length, {
        error: 'Os dias da semana não podem se repetir.',
      }),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    startsOn: localDateSchema,
    // Absent means the block repeats with no end date.
    endsOn: localDateSchema.optional(),
    reason: z
      .string({ error: 'O motivo deve ser um texto.' })
      .trim()
      .max(BLOCK_REASON_MAX_LENGTH, {
        error: `O motivo deve ter no máximo ${String(BLOCK_REASON_MAX_LENGTH)} caracteres.`,
      })
      .optional(),
  })
  .refine(({ startTime, endTime }) => startTime < endTime, {
    error: 'O horário final deve ser posterior ao inicial.',
    path: ['endTime'],
  })
  .refine(({ startsOn, endsOn }) => endsOn === undefined || startsOn <= endsOn, {
    error: 'A data final deve ser igual ou posterior à data inicial.',
    path: ['endsOn'],
  });

type CreateScheduleBlock = Omit<z.output<typeof blockFieldsSchema>, 'reason'> & {
  reason?: string;
};

export const createScheduleBlockSchema = blockFieldsSchema.transform(
  ({ weekdays, reason, ...rest }): CreateScheduleBlock => ({
    ...rest,
    weekdays: [...weekdays].sort((a, b) => a - b),
    ...(reason ? { reason } : {}),
  }),
);

export type CreateScheduleBlockInput = z.input<typeof createScheduleBlockSchema>;
export type CreateScheduleBlockOutput = z.output<typeof createScheduleBlockSchema>;
