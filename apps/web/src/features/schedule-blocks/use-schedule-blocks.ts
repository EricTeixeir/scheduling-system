import type { CreateScheduleBlockOutput } from '@scheduling/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';

import { appointmentKeys } from '../appointments/shared/appointment-query-keys';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  fetchScheduleBlocks,
} from './schedule-blocks-api';

const scheduleBlockKeys = { all: ['schedule-blocks'] as const };

export function useScheduleBlocks() {
  const api = useApiClient();
  return useQuery({
    queryKey: scheduleBlockKeys.all,
    queryFn: ({ signal }) => fetchScheduleBlocks(api, signal),
  });
}

function useInvalidateBlocksAndAvailability() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: scheduleBlockKeys.all }),
      queryClient.invalidateQueries({ queryKey: appointmentKeys.availability() }),
    ]);
}

export function useCreateScheduleBlock() {
  const api = useApiClient();
  const invalidate = useInvalidateBlocksAndAvailability();
  return useMutation({
    mutationKey: ['schedule-blocks', 'create'],
    mutationFn: (input: CreateScheduleBlockOutput) => createScheduleBlock(api, input),
    meta: { handlesErrorInline: true },
    onSettled: invalidate,
  });
}

export function useDeleteScheduleBlock() {
  const api = useApiClient();
  const invalidate = useInvalidateBlocksAndAvailability();
  return useMutation({
    mutationKey: ['schedule-blocks', 'delete'],
    mutationFn: (id: string) => deleteScheduleBlock(api, id),
    onSettled: invalidate,
  });
}
