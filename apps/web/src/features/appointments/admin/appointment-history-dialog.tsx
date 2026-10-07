import type {
  AdminAppointment,
  AppointmentHistoryAction,
  AppointmentHistoryEntry,
} from '@scheduling/shared';
import { CloudOff, History } from 'lucide-react';

import { ROLE_LABELS } from '@/app/navigation';
import { InlineState } from '@/components/states/inline-state';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { formatDayTitle, formatTime } from '@/lib/time/format';
import { localDateOf } from '@/lib/time/local-date';

import { appointmentWhen } from '../shared/appointment-format';
import { useAppointmentHistory } from './use-admin-appointments';

function historyActionLabel(action: AppointmentHistoryAction): string {
  switch (action) {
    case 'APPOINTMENT_CREATED':
      return 'Agendamento criado';
    case 'APPOINTMENT_CANCELLED':
      return 'Agendamento cancelado';
    case 'APPOINTMENT_COMPLETED':
      return 'Atendimento concluído';
    case 'APPOINTMENT_NO_SHOW':
      return 'Cliente não compareceu';
  }
}

function occurredAtLabel(occurredAt: string): string {
  const day = formatDayTitle(localDateOf(occurredAt, BUSINESS_TIME_ZONE));
  return `${day} às ${formatTime(occurredAt, BUSINESS_TIME_ZONE)}`;
}

interface AppointmentHistoryDialogProps {
  readonly appointment: AdminAppointment | null;
  readonly onClose: () => void;
}

export function AppointmentHistoryDialog({ appointment, onClose }: AppointmentHistoryDialogProps) {
  return (
    <Dialog
      open={appointment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader className="pr-10">
          <DialogTitle>Histórico</DialogTitle>
          <DialogDescription>
            {appointment === null
              ? null
              : `${appointment.client.name} · ${appointmentWhen(appointment, BUSINESS_TIME_ZONE)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="-ml-2 overflow-y-auto pt-1 pl-2">
          {appointment === null ? null : <HistoryTimeline appointmentId={appointment.id} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTimeline({ appointmentId }: { readonly appointmentId: string }) {
  const history = useAppointmentHistory(appointmentId);

  if (history.isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-4 pt-2">
        <span className="sr-only">Carregando histórico…</span>
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    );
  }
  if (history.isError) {
    return (
      <InlineState
        icon={CloudOff}
        tone="destructive"
        title="Não foi possível carregar o histórico"
        description={messageFor(history.error)}
        action={
          <Button
            variant="outline"
            onClick={() => {
              void history.refetch();
            }}
          >
            Tentar novamente
          </Button>
        }
      />
    );
  }
  if (history.data.items.length === 0) {
    return (
      <InlineState
        icon={History}
        title="Nenhum evento registrado"
        description="As mudanças deste agendamento aparecem aqui."
      />
    );
  }

  return (
    <ol aria-label="Eventos do agendamento" className="relative space-y-5 border-l pl-5">
      {history.data.items.map((entry) => (
        <HistoryItem key={entry.id} entry={entry} />
      ))}
    </ol>
  );
}

function HistoryItem({ entry }: { readonly entry: AppointmentHistoryEntry }) {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary ring-4 ring-background"
      />
      <p className="font-medium">{historyActionLabel(entry.action)}</p>
      <p className="text-sm text-muted-foreground">
        {entry.actor.name} · {ROLE_LABELS[entry.actor.role]}
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">
        <time dateTime={entry.occurredAt}>{occurredAtLabel(entry.occurredAt)}</time>
      </p>
    </li>
  );
}
