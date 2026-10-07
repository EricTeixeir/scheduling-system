import type { AdminAppointment } from '@scheduling/shared';
import { Clock } from 'lucide-react';
import { useId } from 'react';

import { DESKTOP_MEDIA_QUERY } from '@/components/confirm-surface';
import { useMediaQuery } from '@/hooks/use-media-query';

import type { AppointmentAction } from '../shared/appointment-action';
import { AppointmentActionsMenu } from '../shared/appointment-actions';
import {
  appointmentDayTitle,
  appointmentTimeRange,
  appointmentWhen,
} from '../shared/appointment-format';
import { AppointmentStatusBadge } from '../shared/appointment-status-badge';

interface AdminAppointmentListProps {
  readonly appointments: readonly AdminAppointment[];
  readonly actions: readonly AppointmentAction<AdminAppointment>[];
  readonly now: Date;
  readonly timeZone: string;
}

type RowProps = Omit<AdminAppointmentListProps, 'appointments'> & {
  readonly appointment: AdminAppointment;
};

export function AdminAppointmentList(props: AdminAppointmentListProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  return isDesktop ? <AppointmentTable {...props} /> : <AppointmentCards {...props} />;
}

function ActionsMenu({ appointment, actions, now, timeZone }: RowProps) {
  return (
    <AppointmentActionsMenu
      appointment={appointment}
      actions={actions}
      now={now}
      label={`Ações para ${appointment.client.name}, ${appointmentWhen(appointment, timeZone)}`}
    />
  );
}

function AppointmentCards({ appointments, ...shared }: AdminAppointmentListProps) {
  return (
    <ul className="grid gap-3">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <AppointmentCard appointment={appointment} {...shared} />
        </li>
      ))}
    </ul>
  );
}

function AppointmentCard({ appointment, ...shared }: RowProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <p
          id={titleId}
          className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold tabular-nums"
        >
          <span>{appointmentDayTitle(appointment, shared.timeZone)}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {appointmentTimeRange(appointment, shared.timeZone)}
          </span>
        </p>
        <div className="min-w-0">
          <p className="truncate font-medium">{appointment.client.name}</p>
          <p className="truncate text-sm text-muted-foreground">{appointment.client.email}</p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      <ActionsMenu appointment={appointment} {...shared} />
    </article>
  );
}

function AppointmentTable({ appointments, ...shared }: AdminAppointmentListProps) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Data
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Horário
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Cliente
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {appointments.map((appointment) => (
            <tr key={appointment.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium whitespace-nowrap">
                {appointmentDayTitle(appointment, shared.timeZone)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                {appointmentTimeRange(appointment, shared.timeZone)}
              </td>
              <td className="max-w-64 px-4 py-3">
                <p className="truncate font-medium">{appointment.client.name}</p>
                <p className="truncate text-muted-foreground">{appointment.client.email}</p>
              </td>
              <td className="px-4 py-3">
                <AppointmentStatusBadge status={appointment.status} />
              </td>
              <td className="px-4 py-2 text-right">
                <ActionsMenu appointment={appointment} {...shared} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
