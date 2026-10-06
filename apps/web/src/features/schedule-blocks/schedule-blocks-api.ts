import {
  createScheduleBlockSchema,
  scheduleBlockListSchema,
  scheduleBlockSchema,
  type CreateScheduleBlockOutput,
  type ScheduleBlock,
  type ScheduleBlockList,
} from '@scheduling/shared';

import type { ApiClient } from '@/lib/api/http-client';

const BLOCKS_PATH = '/admin/blocks';

export function fetchScheduleBlocks(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<ScheduleBlockList> {
  return api.request(BLOCKS_PATH, { schema: scheduleBlockListSchema, signal });
}

export function createScheduleBlock(
  api: ApiClient,
  input: CreateScheduleBlockOutput,
): Promise<ScheduleBlock> {
  return api.request(BLOCKS_PATH, {
    method: 'POST',
    body: createScheduleBlockSchema.parse(input),
    schema: scheduleBlockSchema,
  });
}

export function deleteScheduleBlock(api: ApiClient, id: string): Promise<void> {
  return api.request(`${BLOCKS_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
