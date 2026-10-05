import { z } from 'zod';

import { isoDateTimeSchema } from '../common/iso-date-time';
import { localDateSchema } from '../common/local-date';

export const slotSchema = z.object({
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});

export const availabilityResponseSchema = z.object({
  date: localDateSchema,
  timeZone: z.string().min(1),
  slots: z.array(slotSchema),
});

export type Slot = z.output<typeof slotSchema>;
export type AvailabilityResponse = z.output<typeof availabilityResponseSchema>;
