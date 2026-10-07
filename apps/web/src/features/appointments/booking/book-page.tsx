import type { Appointment } from '@scheduling/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { isApiError } from '@/lib/api/api-error';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { localDateOf } from '@/lib/time/local-date';

import { myAppointmentsHighlighting } from '../my-appointments/highlight';
import { useMyAppointments } from '../my-appointments/use-my-appointments';
import { appointmentWhen } from '../shared/appointment-format';
import { createAttemptKeys } from './attempt-keys';
import { BookingConfirmation } from './booking-confirmation';
import {
  bookedRangeOf,
  chooseSlot,
  durationFieldOf,
  withMinutes,
  type ChosenSlot,
  type SlotChoice,
} from './chosen-slot';
import { mySlotsOf } from './grid-slots';
import { SlotPicker } from './slot-picker';
import { useBookAppointment } from './use-booking';

function useMyUpcomingAppointments(): readonly Appointment[] {
  const upcoming = useMyAppointments('upcoming');
  return upcoming.data?.pages.flatMap((page) => page.items) ?? [];
}

function useBookingFlow() {
  const navigate = useNavigate();
  const booking = useBookAppointment();
  const [attemptKeys] = useState(() => createAttemptKeys(() => crypto.randomUUID()));
  const [chosen, setChosen] = useState<ChosenSlot | null>(null);

  const choose = (choice: SlotChoice) => {
    attemptKeys.reset();
    setChosen(chooseSlot(choice));
  };

  const confirm = (chosen: ChosenSlot, notes: string) => {
    const request = { startsAt: chosen.slot.startsAt, notes, ...durationFieldOf(chosen) };
    const idempotencyKey = attemptKeys.keyFor(JSON.stringify(request));
    booking.mutate(
      { ...request, idempotencyKey },
      {
        onSuccess: (appointment) => {
          setChosen(null);
          toast.success('Agendamento confirmado', {
            description: appointmentWhen(bookedRangeOf(chosen), chosen.timeZone),
            action: {
              label: 'Ver meus agendamentos',
              onClick: () => {
                void navigate(myAppointmentsHighlighting(appointment.id));
              },
            },
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
    choose,
    openMine: (appointmentId: string) => {
      void navigate(myAppointmentsHighlighting(appointmentId));
    },
    changeMinutes: (minutes: number) => {
      setChosen((current) => (current === null ? null : withMinutes(current, minutes)));
    },
    confirm,
    dismiss: () => {
      setChosen(null);
    },
    pending: booking.isPending,
  };
}

export function BookPage() {
  const clock = useClock();
  const myAppointments = useMyUpcomingAppointments();
  const flow = useBookingFlow();
  const { chosen } = flow;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agendar horário</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Escolha o dia e o horário que preferir.
        </p>
      </header>
      <SlotPicker
        today={localDateOf(clock.now(), BUSINESS_TIME_ZONE)}
        occupied={{ status: 'ready', slots: mySlotsOf(myAppointments) }}
        selected={chosen === null ? null : bookedRangeOf(chosen)}
        onSelectSlot={flow.choose}
        onOpenMine={flow.openMine}
      />
      {chosen === null ? null : (
        <BookingConfirmation
          key={chosen.slot.startsAt}
          chosen={chosen}
          pending={flow.pending}
          onMinutesChange={flow.changeMinutes}
          onDismiss={flow.dismiss}
          onConfirm={(notes) => {
            flow.confirm(chosen, notes);
          }}
        />
      )}
    </div>
  );
}
