import type { AdminAppointment, ClientSummary, Slot } from '@scheduling/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { isApiError } from '@/lib/api/api-error';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { localDateOf, type LocalDate } from '@/lib/time/local-date';

import { createAttemptKeys } from '../booking/attempt-keys';
import type { OccupiedSlot } from '../booking/day-periods';
import { SlotPicker, type OccupiedSlots } from '../booking/slot-picker';
import { appointmentWhen } from '../shared/appointment-format';
import { AppointmentHistorySheet } from './appointment-history-sheet';
import { BookForClientConfirmation } from './book-for-client-confirmation';
import { useBookForClient, useConfirmedAppointmentsOn } from './use-admin-appointments';

interface ChosenSlot {
  readonly slot: Slot;
  readonly timeZone: string;
}

function useBookForClientFlow(onShowScheduled: () => void) {
  const booking = useBookForClient();
  const [attemptKeys] = useState(() => createAttemptKeys(() => crypto.randomUUID()));
  const [chosen, setChosen] = useState<ChosenSlot | null>(null);

  const confirm = ({ slot, timeZone }: ChosenSlot, client: ClientSummary, notes: string) => {
    const request = { clientId: client.id, startsAt: slot.startsAt, notes };
    const idempotencyKey = attemptKeys.keyFor(JSON.stringify(request));
    booking.mutate(
      { ...request, idempotencyKey },
      {
        onSuccess: () => {
          setChosen(null);
          toast.success(`Agendado para ${client.name}`, {
            description: appointmentWhen(slot, timeZone),
            action: { label: 'Ver agendados', onClick: onShowScheduled },
          });
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'SLOT_TAKEN') setChosen(null);
        },
      },
    );
  };

  return {
    chosen,
    choose: (slot: Slot, timeZone: string) => {
      attemptKeys.reset();
      setChosen({ slot, timeZone });
    },
    confirm,
    dismiss: () => {
      setChosen(null);
    },
    pending: booking.isPending,
  };
}

function bookedSlotsOf(appointments: readonly AdminAppointment[]): OccupiedSlot[] {
  return appointments.map(({ id, startsAt, endsAt, client }) => ({
    startsAt,
    endsAt,
    kind: 'booked',
    appointmentId: id,
    clientName: client.name,
  }));
}

function useBookedSlotsOn(date: LocalDate) {
  const appointments = useConfirmedAppointmentsOn(date);
  const occupied: OccupiedSlots = appointments.isPending
    ? { status: 'pending' }
    : appointments.isError
      ? {
          status: 'error',
          error: appointments.error,
          retry: () => {
            void appointments.refetch();
          },
        }
      : { status: 'ready', slots: bookedSlotsOf(appointments.data) };
  return {
    occupied,
    appointmentOf: (id: string) => appointments.data?.find((appointment) => appointment.id === id),
  };
}

interface AdminAvailableSlotsProps {
  readonly onShowScheduled: () => void;
}

export function AdminAvailableSlots({ onShowScheduled }: AdminAvailableSlotsProps) {
  const clock = useClock();
  const today = localDateOf(clock.now(), BUSINESS_TIME_ZONE);
  const [day, setDay] = useState(today);
  const booked = useBookedSlotsOn(day);
  const [historyFor, setHistoryFor] = useState<AdminAppointment | null>(null);
  const flow = useBookForClientFlow(onShowScheduled);
  const { chosen } = flow;

  return (
    <>
      <SlotPicker
        today={today}
        occupied={booked.occupied}
        selectedStartsAt={chosen?.slot.startsAt ?? null}
        onSelectSlot={flow.choose}
        onDayChange={setDay}
        onOpenBooked={(appointmentId) => {
          setHistoryFor(booked.appointmentOf(appointmentId) ?? null);
        }}
      />
      <AppointmentHistorySheet
        appointment={historyFor}
        onClose={() => {
          setHistoryFor(null);
        }}
      />
      {chosen === null ? null : (
        <BookForClientConfirmation
          key={chosen.slot.startsAt}
          slot={chosen.slot}
          timeZone={chosen.timeZone}
          pending={flow.pending}
          onDismiss={flow.dismiss}
          onConfirm={(client, notes) => {
            flow.confirm(chosen, client, notes);
          }}
        />
      )}
    </>
  );
}
