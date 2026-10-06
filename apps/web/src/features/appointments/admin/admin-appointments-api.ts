import {
  adminAppointmentSchema,
  adminAppointmentsQuerySchema,
  appointmentHistorySchema,
  paginatedSchema,
  updateAppointmentStatusSchema,
  type AdminAppointment,
  type AdminAppointmentsQueryInput,
  type AppointmentHistory,
  type AppointmentStatusTarget,
  type Paginated,
} from '@scheduling/shared';

import type { ApiClient } from '@/lib/api/http-client';

const adminAppointmentPageSchema = paginatedSchema(adminAppointmentSchema);

export type AdminAppointmentPage = Paginated<typeof adminAppointmentSchema>;

function appointmentPath(id: string, action: 'status' | 'history'): string {
  return `/admin/appointments/${encodeURIComponent(id)}/${action}`;
}

export function fetchAdminAppointments(
  api: ApiClient,
  input: AdminAppointmentsQueryInput,
  signal?: AbortSignal,
): Promise<AdminAppointmentPage> {
  const { page, pageSize, status, from, to, q } = adminAppointmentsQuerySchema.parse(input);
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status !== undefined) search.set('status', status);
  if (from !== undefined) search.set('from', from);
  if (to !== undefined) search.set('to', to);
  if (q !== undefined) search.set('q', q);
  return api.request(`/admin/appointments?${search.toString()}`, {
    schema: adminAppointmentPageSchema,
    signal,
  });
}

export function updateAppointmentStatus(
  api: ApiClient,
  id: string,
  status: AppointmentStatusTarget,
): Promise<AdminAppointment> {
  return api.request(appointmentPath(id, 'status'), {
    method: 'POST',
    body: updateAppointmentStatusSchema.parse({ status }),
    schema: adminAppointmentSchema,
  });
}

export function fetchAppointmentHistory(
  api: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<AppointmentHistory> {
  return api.request(appointmentPath(id, 'history'), {
    schema: appointmentHistorySchema,
    signal,
  });
}

export function pageCountOf({ pageSize, total }: AdminAppointmentPage): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
