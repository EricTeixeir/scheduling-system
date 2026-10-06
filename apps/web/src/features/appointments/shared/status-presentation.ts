import type { AppointmentStatus } from '@scheduling/shared';
import { CalendarCheck, CircleCheck, CircleSlash, UserX, type LucideIcon } from 'lucide-react';

export type StatusTone = 'info' | 'success' | 'neutral' | 'warning';

export interface StatusPresentation {
  readonly label: string;
  readonly tone: StatusTone;
  readonly icon: LucideIcon;
}

export const STATUS_PRESENTATION: Readonly<Record<AppointmentStatus, StatusPresentation>> = {
  CONFIRMED: { label: 'Confirmado', tone: 'info', icon: CalendarCheck },
  COMPLETED: { label: 'Concluído', tone: 'success', icon: CircleCheck },
  CANCELLED: { label: 'Cancelado', tone: 'neutral', icon: CircleSlash },
  NO_SHOW: { label: 'Não compareceu', tone: 'warning', icon: UserX },
};

export const STATUS_TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  info: 'bg-primary/10 text-primary dark:bg-primary/20',
  success: 'bg-success/10 text-success dark:bg-success/20',
  neutral: 'bg-muted text-muted-foreground',
  warning: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
};

export function toneClassesOf(tone: StatusTone): string {
  // eslint-disable-next-line security/detect-object-injection -- tone is a typed StatusTone, never free-form input.
  return STATUS_TONE_CLASSES[tone];
}

export function statusPresentationOf(status: AppointmentStatus): StatusPresentation {
  // eslint-disable-next-line security/detect-object-injection -- status is a typed AppointmentStatus, never free-form input.
  return STATUS_PRESENTATION[status];
}
