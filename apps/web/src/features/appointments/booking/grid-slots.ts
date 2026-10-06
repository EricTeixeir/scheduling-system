import type { Appointment, Slot } from '@scheduling/shared';

import { localDateOf, type LocalDate } from '@/lib/time/local-date';

import type { GridSlot } from './day-periods';

export function gridSlotsOf(
  freeSlots: readonly Slot[],
  myAppointments: readonly Appointment[],
  date: LocalDate,
  timeZone: string,
): GridSlot[] {
  const mine = myAppointments
    .filter(
      (appointment) =>
        appointment.status === 'CONFIRMED' && localDateOf(appointment.startsAt, timeZone) === date,
    )
    .map(({ id, startsAt, endsAt }): GridSlot => ({
      startsAt,
      endsAt,
      kind: 'mine',
      appointmentId: id,
    }));
  const free = freeSlots.map(({ startsAt, endsAt }): GridSlot => ({
    startsAt,
    endsAt,
    kind: 'free',
  }));
  return [...free, ...mine].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
