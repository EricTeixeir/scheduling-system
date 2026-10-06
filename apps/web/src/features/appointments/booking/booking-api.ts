import {
  appointmentSchema,
  availabilityQuerySchema,
  availabilityResponseSchema,
  createAppointmentSchema,
  type Appointment,
  type AvailabilityResponse,
} from '@scheduling/shared';

import type { ApiClient } from '@/lib/api/http-client';
import type { LocalDate } from '@/lib/time/local-date';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export interface BookingRequest {
  readonly startsAt: string;
  readonly notes: string;
  readonly idempotencyKey: string;
}

export function fetchAvailability(
  api: ApiClient,
  date: LocalDate,
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  const query = new URLSearchParams(availabilityQuerySchema.parse({ date }));
  return api.request(`/availability?${query.toString()}`, {
    schema: availabilityResponseSchema,
    signal,
  });
}

export function bookAppointment(
  api: ApiClient,
  { idempotencyKey, ...input }: BookingRequest,
): Promise<Appointment> {
  return api.request('/appointments', {
    method: 'POST',
    body: createAppointmentSchema.parse(input),
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    schema: appointmentSchema,
  });
}
