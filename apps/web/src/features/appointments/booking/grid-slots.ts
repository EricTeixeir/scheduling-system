import { MAX_APPOINTMENT_MINUTES, type Appointment, type Slot } from '@scheduling/shared';

import { localDateOf, type LocalDate } from '@/lib/time/local-date';

import type { GridSlot, OccupiedSlot } from './day-periods';

export function mySlotsOf(appointments: readonly Appointment[]): OccupiedSlot[] {
  return appointments
    .filter((appointment) => appointment.status === 'CONFIRMED')
    .map(({ id, startsAt, endsAt }) => ({ startsAt, endsAt, kind: 'mine', appointmentId: id }));
}

function durationOf({ startsAt, endsAt }: Slot): number {
  return Date.parse(endsAt) - Date.parse(startsAt);
}

function overlaps(a: Slot, b: Slot): boolean {
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
  );
}

// The availability API does not expose the slot size, so it is read from a free slot; on a day
// with no free slot left, the shortest appointment is the best estimate.
function slotSizeOf(freeSlots: readonly Slot[], occupied: readonly Slot[]): number | null {
  const sizes = (freeSlots.length > 0 ? freeSlots.slice(0, 1) : occupied)
    .map(durationOf)
    .filter((size) => size > 0);
  return sizes.length === 0 ? null : Math.min(...sizes);
}

function cellsOf(range: OccupiedSlot, slotSize: number): OccupiedSlot[] {
  const end = Date.parse(range.endsAt);
  const cells: OccupiedSlot[] = [];
  for (let start = Date.parse(range.startsAt); start < end; start += slotSize) {
    cells.push({
      ...range,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(Math.min(start + slotSize, end)).toISOString(),
    });
  }
  return cells;
}

export function gridSlotsOf(
  freeSlots: readonly Slot[],
  occupied: readonly OccupiedSlot[],
  date: LocalDate,
  timeZone: string,
): GridSlot[] {
  const slotSize = slotSizeOf(freeSlots, occupied);
  const occupiedCells =
    slotSize === null ? [] : occupied.flatMap((range) => cellsOf(range, slotSize));
  const free = freeSlots
    .filter((slot) => !occupied.some((range) => overlaps(slot, range)))
    .map(({ startsAt, endsAt }): GridSlot => ({ startsAt, endsAt, kind: 'free' }));
  const byStart = new Map<string, GridSlot>();
  for (const slot of [...free, ...occupiedCells]) {
    if (localDateOf(slot.startsAt, timeZone) === date) byStart.set(slot.startsAt, slot);
  }
  return [...byStart.values()].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export interface DurationLimits {
  readonly slotMinutes: number;
  readonly maxMinutes: number;
}

const MS_PER_MINUTE = 60_000;

export function durationLimitsAt(slots: readonly GridSlot[], start: Slot): DurationLimits {
  const slotMinutes = durationOf(start) / MS_PER_MINUTE;
  const maxSlots = Math.max(1, Math.floor(MAX_APPOINTMENT_MINUTES / slotMinutes));
  const freeByStart = new Map(
    slots.filter((slot) => slot.kind === 'free').map((slot) => [Date.parse(slot.startsAt), slot]),
  );
  let count = 1;
  let next = freeByStart.get(Date.parse(start.endsAt));
  while (next !== undefined && count < maxSlots) {
    count += 1;
    next = freeByStart.get(Date.parse(next.endsAt));
  }
  return { slotMinutes, maxMinutes: count * slotMinutes };
}
