import type { Slot } from '@scheduling/shared';
import { useId, useState } from 'react';

import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { formatDayTitle } from '@/lib/time/format';
import { addDays, type LocalDate } from '@/lib/time/local-date';

import type { SlotChoice } from './chosen-slot';
import { groupSlotsByPeriod, type GridSlot, type OccupiedSlot } from './day-periods';
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
import { durationLimitsAt, gridSlotsOf } from './grid-slots';
import { useAvailability, useAvailabilityOfDays } from './use-booking';

export type OccupiedSlots =
  | { readonly status: 'pending' }
  | { readonly status: 'error'; readonly error: unknown; readonly retry: () => void }
  | { readonly status: 'ready'; readonly slots: readonly OccupiedSlot[] };

const NOTHING_OCCUPIED: OccupiedSlots = { status: 'ready', slots: [] };

interface DaySlotsView {
  readonly state: DaySlotsState;
  readonly slots: readonly GridSlot[];
  readonly timeZone: string;
  readonly retry: () => void;
}

function useDaySlotsState(date: LocalDate, occupied: OccupiedSlots): DaySlotsView {
  const availability = useAvailability(date);
  const timeZone = availability.data?.timeZone ?? BUSINESS_TIME_ZONE;
  const retry = () => {
    void availability.refetch();
    if (occupied.status === 'error') occupied.retry();
  };
  if (availability.isError) {
    const state = { status: 'error', message: messageFor(availability.error) } as const;
    return { state, slots: [], timeZone, retry };
  }
  if (occupied.status === 'error') {
    const state = { status: 'error', message: messageFor(occupied.error) } as const;
    return { state, slots: [], timeZone, retry };
  }
  if (availability.isPending || occupied.status === 'pending') {
    return { state: { status: 'pending' }, slots: [], timeZone, retry };
  }
  const slots = gridSlotsOf(availability.data.slots, occupied.slots, date, timeZone);
  const groups = groupSlotsByPeriod(slots, timeZone);
  return { state: { status: 'ready', groups, timeZone }, slots, timeZone, retry };
}

interface SlotPickerProps {
  readonly today: LocalDate;
  readonly occupied?: OccupiedSlots;
  readonly selected: Slot | null;
  readonly onSelectSlot: (choice: SlotChoice) => void;
  readonly onDayChange?: (date: LocalDate) => void;
  readonly onOpenMine?: (appointmentId: string) => void;
  readonly onOpenBooked?: (appointmentId: string) => void;
}

export function SlotPicker({
  today,
  occupied = NOTHING_OCCUPIED,
  selected,
  onSelectSlot,
  onDayChange,
  onOpenMine,
  onOpenBooked,
}: SlotPickerProps) {
  const titleId = useId();
  const [selection, setSelection] = useState(() => startSelection(today));
  const days = visibleDays(selection);
  const dayAvailability = useAvailabilityOfDays(days);
  const selectedDay = useDaySlotsState(selection.selected, occupied);
  const changeSelection = (next: DaySelection) => {
    setSelection(next);
    if (next.selected !== selection.selected) onDayChange?.(next.selected);
  };

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
          changeSelection(selectDay(selection, date));
        }}
        onPreviousWeek={() => {
          changeSelection(shiftWeek(selection, -1, today));
        }}
        onNextWeek={() => {
          changeSelection(shiftWeek(selection, 1, today));
        }}
      />
      <section aria-labelledby={titleId} className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 id={titleId} className="mb-5 text-lg font-semibold tracking-tight">
          {formatDayTitle(selection.selected)}
        </h2>
        <DaySlots
          state={selectedDay.state}
          selected={selected}
          onSelectSlot={(slot) => {
            onSelectSlot({
              slot,
              timeZone: selectedDay.timeZone,
              limits: durationLimitsAt(selectedDay.slots, slot),
            });
          }}
          onOpenMine={onOpenMine}
          onOpenBooked={onOpenBooked}
          onRetry={selectedDay.retry}
          onNextDay={() => {
            changeSelection(selectDay(selection, addDays(selection.selected, 1)));
          }}
        />
      </section>
    </div>
  );
}
