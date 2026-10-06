import type { AdminAppointment, AppointmentStatusTarget } from '@scheduling/shared';
import { CalendarX, CircleCheck, History, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';

import type { ActionOutcome, AppointmentAction } from '../shared/appointment-action';
import { appointmentWhen, hasStarted } from '../shared/appointment-format';
import { useUpdateAppointmentStatus } from './use-admin-appointments';

type AdminAction = AppointmentAction<AdminAppointment>;

interface AdminActionDependencies {
  readonly changeStatus: (
    appointment: AdminAppointment,
    status: AppointmentStatusTarget,
    successMessage: string,
  ) => Promise<ActionOutcome>;
  readonly showHistory: (appointment: AdminAppointment) => void;
}

const isConfirmed = (appointment: AdminAppointment) => appointment.status === 'CONFIRMED';

const canRecordOutcome = (appointment: AdminAppointment, now: Date) =>
  isConfirmed(appointment) && hasStarted(appointment, now);

const canCancel = (appointment: AdminAppointment, now: Date) =>
  isConfirmed(appointment) && !hasStarted(appointment, now);

export function adminAppointmentActions(
  { changeStatus, showHistory }: AdminActionDependencies,
  timeZone: string = BUSINESS_TIME_ZONE,
): readonly AdminAction[] {
  return [
    {
      id: 'complete',
      label: 'Concluir',
      icon: CircleCheck,
      variant: 'default',
      isAvailable: canRecordOutcome,
      run: (appointment) => changeStatus(appointment, 'COMPLETED', 'Atendimento concluído.'),
    },
    {
      id: 'no-show',
      label: 'Não compareceu',
      icon: UserX,
      variant: 'outline',
      isAvailable: canRecordOutcome,
      run: (appointment) => changeStatus(appointment, 'NO_SHOW', 'Falta registrada.'),
    },
    {
      id: 'cancel',
      label: 'Cancelar',
      icon: CalendarX,
      variant: 'destructive',
      isAvailable: canCancel,
      confirmation: {
        title: (appointment) => `Cancelar o agendamento de ${appointment.client.name}?`,
        description: (appointment) =>
          `${appointmentWhen(appointment, timeZone)}. O horário volta a ficar disponível para outras pessoas.`,
        confirmLabel: 'Cancelar agendamento',
        pendingLabel: 'Cancelando…',
        dismissLabel: 'Voltar',
        tone: 'destructive',
      },
      run: (appointment) => changeStatus(appointment, 'CANCELLED', 'Agendamento cancelado.'),
    },
    {
      id: 'history',
      label: 'Ver histórico',
      icon: History,
      variant: 'ghost',
      isAvailable: () => true,
      run: (appointment) => {
        showHistory(appointment);
        return Promise.resolve('done');
      },
    },
  ];
}

const reportedByMutationCache = (): ActionOutcome => 'failed';

export function useAdminAppointmentActions(
  showHistory: (appointment: AdminAppointment) => void,
): readonly AdminAction[] {
  const { mutateAsync } = useUpdateAppointmentStatus();
  const changeStatus = async (
    appointment: AdminAppointment,
    status: AppointmentStatusTarget,
    successMessage: string,
  ): Promise<ActionOutcome> => {
    const outcome = await mutateAsync({ id: appointment.id, status }).then(
      (): ActionOutcome => 'done',
      reportedByMutationCache,
    );
    if (outcome === 'done') toast.success(successMessage);
    return outcome;
  };
  return adminAppointmentActions({ changeStatus, showHistory });
}
