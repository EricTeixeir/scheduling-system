import type { AdminAppointmentsQueryInput, AppointmentStatusTarget } from '@scheduling/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';

import { appointmentKeys } from '../shared/appointment-query-keys';
import {
  fetchAdminAppointments,
  fetchAppointmentHistory,
  updateAppointmentStatus,
} from './admin-appointments-api';

export function useAdminAppointments(query: AdminAppointmentsQueryInput) {
  const api = useApiClient();
  return useQuery({
    queryKey: appointmentKeys.adminList(query),
    queryFn: ({ signal }) => fetchAdminAppointments(api, query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAppointmentHistory(id: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: appointmentKeys.history(id),
    queryFn: ({ signal }) => fetchAppointmentHistory(api, id, signal),
  });
}

interface StatusChange {
  readonly id: string;
  readonly status: AppointmentStatusTarget;
}

export function useUpdateAppointmentStatus() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['appointments', 'update-status'],
    mutationFn: ({ id, status }: StatusChange) => updateAppointmentStatus(api, id, status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
