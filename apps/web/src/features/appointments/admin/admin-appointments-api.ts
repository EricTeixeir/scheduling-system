import {
  adminAppointmentSchema,
  adminAppointmentsQuerySchema,
  adminCreateAppointmentSchema,
  adminSummarySchema,
  appointmentHistorySchema,
  clientSearchQuerySchema,
  clientSearchResponseSchema,
  paginatedSchema,
  updateAppointmentStatusSchema,
  type AdminAppointment,
  type AdminAppointmentsQueryInput,
  type AdminSummary,
  type AppointmentHistory,
  type AppointmentStatusTarget,
  type ClientSearchResponse,
  type Paginated,
} from '@scheduling/shared';

import type { ApiClient } from '@/lib/api/http-client';

import { IDEMPOTENCY_KEY_HEADER } from '../booking/booking-api';

export interface BookForClientRequest {
  readonly clientId: string;
  readonly startsAt: string;
  readonly notes: string;
  readonly idempotencyKey: string;
}

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

export function fetchAdminSummary(api: ApiClient, signal?: AbortSignal): Promise<AdminSummary> {
  return api.request('/admin/appointments/summary', { schema: adminSummarySchema, signal });
}

export function bookForClient(
  api: ApiClient,
  { idempotencyKey, ...input }: BookForClientRequest,
): Promise<AdminAppointment> {
  return api.request('/admin/appointments', {
    method: 'POST',
    body: adminCreateAppointmentSchema.parse(input),
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    schema: adminAppointmentSchema,
  });
}

export function searchClients(
  api: ApiClient,
  q: string,
  signal?: AbortSignal,
): Promise<ClientSearchResponse> {
  const query = new URLSearchParams(clientSearchQuerySchema.parse({ q }));
  return api.request(`/admin/clients?${query.toString()}`, {
    schema: clientSearchResponseSchema,
    signal,
  });
}

export function pageCountOf({ pageSize, total }: AdminAppointmentPage): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
