import type { Appointment } from '@scheduling/shared';
import { CalendarX } from 'lucide-react';
import { toast } from 'sonner';

import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';

import type { ActionOutcome, AppointmentAction } from '../shared/appointment-action';
import {
  appointmentWeekdayAndTime,
  appointmentWhen,
  hasStarted,
} from '../shared/appointment-format';
import { useCancelAppointment } from './use-my-appointments';

// The cancellation deadline is enforced only by the server (CANCEL_DEADLINE_PASSED), so the
// button stays visible until the appointment starts instead of copying that rule here.
export function isCancellableByClient(appointment: Appointment, now: Date): boolean {
  return appointment.status === 'CONFIRMED' && !hasStarted(appointment, now);
}

export function cancelAction(
  cancel: (appointment: Appointment) => Promise<ActionOutcome>,
  timeZone: string = BUSINESS_TIME_ZONE,
): AppointmentAction {
  return {
    id: 'cancel',
    label: 'Cancelar',
    icon: CalendarX,
    variant: 'outline',
    isAvailable: isCancellableByClient,
    confirmation: {
      title: (appointment) =>
        `Cancelar o agendamento de ${appointmentWeekdayAndTime(appointment, timeZone)}?`,
      description: (appointment) =>
        `${appointmentWhen(appointment, timeZone)}. O horário volta a ficar disponível para outras pessoas.`,
      confirmLabel: 'Cancelar agendamento',
      pendingLabel: 'Cancelando…',
      dismissLabel: 'Voltar',
      tone: 'destructive',
    },
    run: cancel,
  };
}

const reportedByMutationCache = (): ActionOutcome => 'failed';

export function useClientAppointmentActions(): readonly AppointmentAction[] {
  const { mutateAsync } = useCancelAppointment();
  const cancel = async (appointment: Appointment): Promise<ActionOutcome> => {
    const outcome = await mutateAsync(appointment.id).then(
      (): ActionOutcome => 'done',
      reportedByMutationCache,
    );
    if (outcome === 'done') toast.success('Agendamento cancelado.');
    return outcome;
  };
  return [cancelAction(cancel)];
}
