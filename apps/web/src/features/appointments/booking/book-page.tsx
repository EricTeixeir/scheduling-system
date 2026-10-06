import type { Appointment, Slot } from '@scheduling/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { isApiError } from '@/lib/api/api-error';
import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { formatDayTitle } from '@/lib/time/format';
import { addDays, localDateOf } from '@/lib/time/local-date';

import { myAppointmentsHighlighting } from '../my-appointments/highlight';
import { useMyAppointments } from '../my-appointments/use-my-appointments';
import { appointmentWhen } from '../shared/appointment-format';
import { createAttemptKeys } from './attempt-keys';
import { BookingConfirmation } from './booking-confirmation';
import { groupSlotsByPeriod } from './day-periods';
import {
  canGoToPreviousWeek,
  selectDay,
  shiftWeek,
  startSelection,
  visibleDays,
  type DaySelection,
} from './day-selection';
import { DaySlots, type DaySlotsState } from './day-slots';
import { DayStrip } from './day-strip';
import { gridSlotsOf } from './grid-slots';
import { useAvailability, useAvailabilityOfDays, useBookAppointment } from './use-booking';

function useMyUpcomingAppointments(): readonly Appointment[] {
  const upcoming = useMyAppointments('upcoming');
  return upcoming.data?.pages.flatMap((page) => page.items) ?? [];
}

function useSelectedDayState(selection: DaySelection): {
  readonly state: DaySlotsState;
  readonly timeZone: string;
  readonly retry: () => void;
} {
  const availability = useAvailability(selection.selected);
  const myAppointments = useMyUpcomingAppointments();
  const timeZone = availability.data?.timeZone ?? BUSINESS_TIME_ZONE;
  const retry = () => {
    void availability.refetch();
  };
  if (availability.isPending) return { state: { status: 'pending' }, timeZone, retry };
  if (availability.isError) {
    return { state: { status: 'error', message: messageFor(availability.error) }, timeZone, retry };
  }
  const slots = gridSlotsOf(availability.data.slots, myAppointments, selection.selected, timeZone);
  const groups = groupSlotsByPeriod(slots, timeZone);
  return { state: { status: 'ready', groups, timeZone }, timeZone, retry };
}

function useBookingFlow() {
  const navigate = useNavigate();
  const booking = useBookAppointment();
  const [attemptKeys] = useState(() => createAttemptKeys(() => crypto.randomUUID()));
  const [chosenSlot, setChosenSlot] = useState<Slot | null>(null);

  const choose = (slot: Slot) => {
    attemptKeys.reset();
    setChosenSlot(slot);
  };

  const confirm = (slot: Slot, notes: string, timeZone: string) => {
    const request = { startsAt: slot.startsAt, notes };
    const idempotencyKey = attemptKeys.keyFor(JSON.stringify(request));
    booking.mutate(
      { ...request, idempotencyKey },
      {
        onSuccess: (appointment) => {
          setChosenSlot(null);
          toast.success('Agendamento confirmado', {
            description: appointmentWhen(slot, timeZone),
            action: {
              label: 'Ver meus agendamentos',
              onClick: () => {
                void navigate(myAppointmentsHighlighting(appointment.id));
              },
            },
          });
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'SLOT_TAKEN') setChosenSlot(null);
        },
      },
    );
  };

  return {
    chosenSlot,
    choose,
    openMine: (appointmentId: string) => {
      void navigate(myAppointmentsHighlighting(appointmentId));
    },
    confirm,
    dismiss: () => {
      setChosenSlot(null);
    },
    pending: booking.isPending,
  };
}

export function BookPage() {
  const clock = useClock();
  const today = localDateOf(clock.now(), BUSINESS_TIME_ZONE);
  const [selection, setSelection] = useState(() => startSelection(today));
  const days = visibleDays(selection);
  const dayAvailability = useAvailabilityOfDays(days);
  const selectedDay = useSelectedDayState(selection);
  const flow = useBookingFlow();
  const { chosenSlot } = flow;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agendar horário</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Escolha o dia e o horário que preferir.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[17rem_1fr] lg:items-start lg:gap-6">
        <DayStrip
          days={days.map((date, index) => ({
            date,
            slotCount: dayAvailability.at(index)?.data?.slots.length,
          }))}
          selectedDate={selection.selected}
          today={today}
          canGoBack={canGoToPreviousWeek(selection, today)}
          onSelect={(date) => {
            setSelection((current) => selectDay(current, date));
          }}
          onPreviousWeek={() => {
            setSelection((current) => shiftWeek(current, -1, today));
          }}
          onNextWeek={() => {
            setSelection((current) => shiftWeek(current, 1, today));
          }}
        />
        <section
          aria-labelledby="selected-day-title"
          className="rounded-xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <h2 id="selected-day-title" className="mb-5 text-lg font-semibold tracking-tight">
            {formatDayTitle(selection.selected)}
          </h2>
          <DaySlots
            state={selectedDay.state}
            selectedStartsAt={chosenSlot?.startsAt ?? null}
            onSelectSlot={flow.choose}
            onOpenMine={flow.openMine}
            onRetry={selectedDay.retry}
            onNextDay={() => {
              setSelection((current) => selectDay(current, addDays(current.selected, 1)));
            }}
          />
        </section>
      </div>
      {chosenSlot === null ? null : (
        <BookingConfirmation
          key={chosenSlot.startsAt}
          slot={chosenSlot}
          timeZone={selectedDay.timeZone}
          pending={flow.pending}
          onDismiss={flow.dismiss}
          onConfirm={(notes) => {
            flow.confirm(chosenSlot, notes, selectedDay.timeZone);
          }}
        />
      )}
    </div>
  );
}
