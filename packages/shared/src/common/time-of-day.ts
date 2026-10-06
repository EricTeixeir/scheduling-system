import { z } from 'zod';

export const timeOfDaySchema = z
  .string({ error: 'Informe o horário.' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Horário inválido. Use o formato HH:mm.' });
