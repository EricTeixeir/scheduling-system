import type { Appointment } from '@scheduling/shared';
import { Clock, StickyNote } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { appointmentDayTitle, appointmentTimeRange } from '../shared/appointment-format';
import { AppointmentStatusBadge } from '../shared/appointment-status-badge';

interface AppointmentCardProps {
  readonly appointment: Appointment;
  readonly timeZone: string;
  readonly actions?: ReactNode;
}

export function AppointmentCard({ appointment, timeZone, actions }: AppointmentCardProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 id={titleId} className="font-semibold tracking-tight">
            {appointmentDayTitle(appointment, timeZone)}
          </h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
            <Clock className="size-4" aria-hidden="true" />
            {appointmentTimeRange(appointment, timeZone)}
          </p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      {appointment.notes === null ? null : (
        <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm break-words whitespace-pre-line">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="sr-only">Observações: </span>
            {appointment.notes}
          </span>
        </p>
      )}
      {actions === undefined ? null : <div className="flex justify-end">{actions}</div>}
    </article>
  );
}
