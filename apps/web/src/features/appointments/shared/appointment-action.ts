import type { Appointment } from '@scheduling/shared';
import type { LucideIcon } from 'lucide-react';

export interface ActionConfirmation<Item extends Appointment> {
  readonly title: (appointment: Item) => string;
  readonly description: (appointment: Item) => string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly dismissLabel: string;
  readonly tone: 'default' | 'destructive';
}

export interface AppointmentAction<Item extends Appointment = Appointment> {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly variant: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  readonly isAvailable: (appointment: Item, now: Date) => boolean;
  readonly confirmation?: ActionConfirmation<Item>;
  readonly run: (appointment: Item) => Promise<ActionOutcome>;
}

export type ActionOutcome = 'done' | 'failed';

export function availableActions<Item extends Appointment>(
  actions: readonly AppointmentAction<Item>[],
  appointment: Item,
  now: Date,
): readonly AppointmentAction<Item>[] {
  return actions.filter((action) => action.isAvailable(appointment, now));
}
