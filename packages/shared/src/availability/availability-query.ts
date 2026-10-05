import { z } from 'zod';

import { localDateSchema } from '../common/local-date';

export const availabilityQuerySchema = z.strictObject({ date: localDateSchema });

export type AvailabilityQueryInput = z.input<typeof availabilityQuerySchema>;
export type AvailabilityQueryOutput = z.output<typeof availabilityQuerySchema>;
