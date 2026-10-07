import type { AdminAppointmentsQueryInput, AppointmentStatusTarget } from '@scheduling/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';

import { appointmentKeys } from '../shared/appointment-query-keys';
import {
  bookForClient,
  fetchAdminAppointments,
  fetchAdminSummary,
  fetchAppointmentHistory,
  searchClients,
  updateAppointmentStatus,
  type BookForClientRequest,
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

export function useAdminSummary() {
  const api = useApiClient();
  return useQuery({
    queryKey: appointmentKeys.summary(),
    queryFn: ({ signal }) => fetchAdminSummary(api, signal),
  });
}

export function useClientSearch(q: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['clients', 'search', q],
    queryFn: ({ signal }) => searchClients(api, q, signal),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  });
}

export function useBookForClient() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['appointments', 'book-for-client'],
    mutationFn: (request: BookForClientRequest) => bookForClient(api, request),
    onSettled: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
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
