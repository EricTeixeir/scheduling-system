import type { AppointmentStatus } from '@scheduling/shared';

import { addDays, type LocalDate } from '@/lib/time/local-date';

export const PERIODS = [
  { value: 'from-today', label: 'Hoje em diante' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Próximos 7 dias' },
  { value: 'all', label: 'Todos' },
] as const;

export type Period = (typeof PERIODS)[number]['value'];

export type StatusFilter = AppointmentStatus | 'ALL';

export interface PeriodRange {
  readonly from?: LocalDate;
  readonly to?: LocalDate;
}

export function periodRange(period: Period, today: LocalDate): PeriodRange {
  switch (period) {
    case 'from-today':
      return { from: today };
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: today, to: addDays(today, 6) };
    case 'all':
      return {};
  }
}
