import type { Slot } from '@scheduling/shared';

import type { DurationLimits } from './grid-slots';

export interface SlotChoice {
  readonly slot: Slot;
  readonly timeZone: string;
  readonly limits: DurationLimits;
}

export interface ChosenSlot extends SlotChoice {
  readonly minutes: number;
}

const MS_PER_MINUTE = 60_000;

export function chooseSlot(choice: SlotChoice): ChosenSlot {
  return { ...choice, minutes: choice.limits.slotMinutes };
}

export function withMinutes(chosen: ChosenSlot, minutes: number): ChosenSlot {
  const { slotMinutes, maxMinutes } = chosen.limits;
  const whole = Math.round(minutes / slotMinutes) * slotMinutes;
  return { ...chosen, minutes: Math.min(Math.max(whole, slotMinutes), maxMinutes) };
}

export function bookedRangeOf({ slot, minutes }: ChosenSlot): Slot {
  const endsAt = new Date(Date.parse(slot.startsAt) + minutes * MS_PER_MINUTE);
  return { startsAt: slot.startsAt, endsAt: endsAt.toISOString() };
}

export function durationFieldOf({ limits, minutes }: ChosenSlot): { durationMinutes?: number } {
  return minutes > limits.slotMinutes ? { durationMinutes: minutes } : {};
}
