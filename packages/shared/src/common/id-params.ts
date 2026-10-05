import { z } from 'zod';

import { uuidSchema } from './uuid';

export const idParamsSchema = z.strictObject({ id: uuidSchema });

export type IdParamsInput = z.input<typeof idParamsSchema>;
export type IdParamsOutput = z.output<typeof idParamsSchema>;
