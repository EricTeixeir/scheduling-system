import { PATHS } from '@/app/navigation';

export const HIGHLIGHT_PARAM = 'destaque';

export function myAppointmentsHighlighting(appointmentId: string): string {
  const search = new URLSearchParams({ [HIGHLIGHT_PARAM]: appointmentId });
  return `${PATHS.myAppointments}?${search.toString()}`;
}
