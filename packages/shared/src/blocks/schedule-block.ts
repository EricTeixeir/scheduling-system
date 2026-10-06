import { z } from 'zod';

import { isoDateTimeSchema } from '../common/iso-date-time';
import { localDateSchema } from '../common/local-date';
import { timeOfDaySchema } from '../common/time-of-day';
import { uuidSchema } from '../common/uuid';

export const scheduleBlockSchema = z.object({
  id: uuidSchema,
  weekdays: z.array(z.int().min(0).max(6)).min(1).max(7),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  startsOn: localDateSchema,
  endsOn: localDateSchema.nullable(),
  reason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});

export const scheduleBlockListSchema = z.object({ items: z.array(scheduleBlockSchema) });

export type ScheduleBlock = z.output<typeof scheduleBlockSchema>;
export type ScheduleBlockList = z.output<typeof scheduleBlockListSchema>;
