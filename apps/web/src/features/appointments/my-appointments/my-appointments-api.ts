import {
  appointmentSchema,
  clientAppointmentsQuerySchema,
  paginatedSchema,
  type Appointment,
  type AppointmentScope,
  type Paginated,
} from '@scheduling/shared';

import type { ApiClient } from '@/lib/api/http-client';

const appointmentPageSchema = paginatedSchema(appointmentSchema);

export type AppointmentPage = Paginated<typeof appointmentSchema>;

export function fetchMyAppointments(
  api: ApiClient,
  { scope, page }: { readonly scope: AppointmentScope; readonly page: number },
  signal?: AbortSignal,
): Promise<AppointmentPage> {
  const query = clientAppointmentsQuerySchema.parse({ scope, page });
  const search = new URLSearchParams({
    scope: query.scope,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  return api.request(`/appointments?${search.toString()}`, {
    schema: appointmentPageSchema,
    signal,
  });
}

export function cancelAppointment(api: ApiClient, id: string): Promise<Appointment> {
  return api.request(`/appointments/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    schema: appointmentSchema,
  });
}

export function nextPageOf({ page, pageSize, total }: AppointmentPage): number | undefined {
  return page * pageSize < total ? page + 1 : undefined;
}
