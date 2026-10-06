import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';
import type { ApiClient } from '@/lib/api/http-client';
import type { LocalDate } from '@/lib/time/local-date';

import { appointmentKeys } from '../shared/appointment-query-keys';
import { bookAppointment, fetchAvailability, type BookingRequest } from './booking-api';

function availabilityQuery(api: ApiClient, date: LocalDate) {
  return queryOptions({
    queryKey: appointmentKeys.availabilityOn(date),
    queryFn: ({ signal }) => fetchAvailability(api, date, signal),
  });
}

export function useAvailability(date: LocalDate) {
  const api = useApiClient();
  return useQuery(availabilityQuery(api, date));
}

export function useAvailabilityOfDays(dates: readonly LocalDate[]) {
  const api = useApiClient();
  return useQueries({ queries: dates.map((date) => availabilityQuery(api, date)) });
}

export function useBookAppointment() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['appointments', 'book'],
    mutationFn: (request: BookingRequest) => bookAppointment(api, request),
    onSettled: () => queryClient.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
