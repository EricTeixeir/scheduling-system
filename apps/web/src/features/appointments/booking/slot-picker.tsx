import type { Appointment, Slot } from '@scheduling/shared';
import { useId, useState } from 'react';

import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { formatDayTitle } from '@/lib/time/format';
import { addDays, type LocalDate } from '@/lib/time/local-date';

import { groupSlotsByPeriod } from './day-periods';
import {
  canGoToPreviousWeek,
  selectDay,
  shiftWeek,
  startSelection,
  visibleDays,
} from './day-selection';
import { DaySlots, type DaySlotsState } from './day-slots';
import { DayStrip } from './day-strip';
import { gridSlotsOf } from './grid-slots';
import { useAvailability, useAvailabilityOfDays } from './use-booking';

const NO_APPOINTMENTS: readonly Appointment[] = [];

function useDaySlotsState(
  date: LocalDate,
  myAppointments: readonly Appointment[],
): { readonly state: DaySlotsState; readonly timeZone: string; readonly retry: () => void } {
  const availability = useAvailability(date);
  const timeZone = availability.data?.timeZone ?? BUSINESS_TIME_ZONE;
  const retry = () => {
    void availability.refetch();
  };
  if (availability.isPending) return { state: { status: 'pending' }, timeZone, retry };
  if (availability.isError) {
    return { state: { status: 'error', message: messageFor(availability.error) }, timeZone, retry };
  }
  const slots = gridSlotsOf(availability.data.slots, myAppointments, date, timeZone);
  const groups = groupSlotsByPeriod(slots, timeZone);
  return { state: { status: 'ready', groups, timeZone }, timeZone, retry };
}

interface SlotPickerProps {
  readonly today: LocalDate;
  readonly myAppointments?: readonly Appointment[];
  readonly selectedStartsAt: string | null;
  readonly onSelectSlot: (slot: Slot, timeZone: string) => void;
  readonly onOpenMine?: (appointmentId: string) => void;
}

export function SlotPicker({
  today,
  myAppointments = NO_APPOINTMENTS,
  selectedStartsAt,
  onSelectSlot,
  onOpenMine,
}: SlotPickerProps) {
  const titleId = useId();
  const [selection, setSelection] = useState(() => startSelection(today));
  const days = visibleDays(selection);
  const dayAvailability = useAvailabilityOfDays(days);
  const selectedDay = useDaySlotsState(selection.selected, myAppointments);

  return (
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
      <section aria-labelledby={titleId} className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 id={titleId} className="mb-5 text-lg font-semibold tracking-tight">
          {formatDayTitle(selection.selected)}
        </h2>
        <DaySlots
          state={selectedDay.state}
          selectedStartsAt={selectedStartsAt}
          onSelectSlot={(slot) => {
            onSelectSlot(slot, selectedDay.timeZone);
          }}
          onOpenMine={onOpenMine}
          onRetry={selectedDay.retry}
          onNextDay={() => {
            setSelection((current) => selectDay(current, addDays(current.selected, 1)));
          }}
        />
      </section>
    </div>
  );
}
