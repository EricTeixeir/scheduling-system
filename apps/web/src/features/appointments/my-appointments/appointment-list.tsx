import type { Appointment } from '@scheduling/shared';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { AppointmentCard } from './appointment-card';

interface AppointmentListProps {
  readonly appointments: readonly Appointment[];
  readonly timeZone: string;
  readonly renderActions: (appointment: Appointment) => ReactNode;
}

export function AppointmentList({ appointments, timeZone, renderActions }: AppointmentListProps) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {appointments.map((appointment) => (
        <li key={appointment.id}>
          <AppointmentCard
            appointment={appointment}
            timeZone={timeZone}
            actions={renderActions(appointment)}
          />
        </li>
      ))}
    </ul>
  );
}

export function AppointmentListSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-3 md:grid-cols-2">
      <span className="sr-only">Carregando agendamentos…</span>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-9 w-28" />
        </div>
      ))}
    </div>
  );
}
