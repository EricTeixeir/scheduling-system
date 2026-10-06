import type { Slot } from '@scheduling/shared';
import { Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react';

import { hourOf } from '@/lib/time/format';

export interface DayPeriod {
  readonly id: 'morning' | 'afternoon' | 'evening';
  readonly label: string;
  readonly icon: LucideIcon;
  readonly fromHour: number;
  readonly untilHour: number;
}

export const DAY_PERIODS: readonly DayPeriod[] = [
  { id: 'morning', label: 'Manhã', icon: Sunrise, fromHour: 0, untilHour: 12 },
  { id: 'afternoon', label: 'Tarde', icon: Sun, fromHour: 12, untilHour: 18 },
  { id: 'evening', label: 'Noite', icon: Moon, fromHour: 18, untilHour: 24 },
];

export interface SlotGroup {
  readonly period: DayPeriod;
  readonly slots: readonly Slot[];
}

export function groupSlotsByPeriod(slots: readonly Slot[], timeZone: string): SlotGroup[] {
  return DAY_PERIODS.map((period) => ({
    period,
    slots: slots.filter((slot) => {
      const hour = hourOf(slot.startsAt, timeZone);
      return hour >= period.fromHour && hour < period.untilHour;
    }),
  })).filter((group) => group.slots.length > 0);
}
