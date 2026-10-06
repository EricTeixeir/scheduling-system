import type { AppointmentScope } from '@scheduling/shared';

import type { LocalDate } from '@/lib/time/local-date';

export const appointmentKeys = {
  all: ['appointments'] as const,
  availability: () => [...appointmentKeys.all, 'availability'] as const,
  availabilityOn: (date: LocalDate) => [...appointmentKeys.availability(), date] as const,
  mine: () => [...appointmentKeys.all, 'mine'] as const,
  mineIn: (scope: AppointmentScope) => [...appointmentKeys.mine(), scope] as const,
};
