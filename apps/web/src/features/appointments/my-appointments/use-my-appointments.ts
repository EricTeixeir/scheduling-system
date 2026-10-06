import type { AppointmentScope } from '@scheduling/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';

import { appointmentKeys } from '../shared/appointment-query-keys';
import { cancelAppointment, fetchMyAppointments, nextPageOf } from './my-appointments-api';

export function useMyAppointments(scope: AppointmentScope) {
  const api = useApiClient();
  return useInfiniteQuery({
    queryKey: appointmentKeys.mineIn(scope),
    queryFn: ({ pageParam, signal }) =>
      fetchMyAppointments(api, { scope, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextPageOf,
  });
}

export function useCancelAppointment() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['appointments', 'cancel'],
    mutationFn: (id: string) => cancelAppointment(api, id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
