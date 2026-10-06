import type { AdminAppointmentsQueryInput, AppointmentScope } from '@scheduling/shared';

import type { LocalDate } from '@/lib/time/local-date';

export const appointmentKeys = {
  all: ['appointments'] as const,
  availability: () => [...appointmentKeys.all, 'availability'] as const,
  availabilityOn: (date: LocalDate) => [...appointmentKeys.availability(), date] as const,
  mine: () => [...appointmentKeys.all, 'mine'] as const,
  mineIn: (scope: AppointmentScope) => [...appointmentKeys.mine(), scope] as const,
  admin: () => [...appointmentKeys.all, 'admin'] as const,
  adminList: (query: AdminAppointmentsQueryInput) =>
    [...appointmentKeys.admin(), 'list', query] as const,
  history: (id: string) => [...appointmentKeys.admin(), 'history', id] as const,
  summary: () => [...appointmentKeys.admin(), 'summary'] as const,
};
