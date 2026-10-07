import type { Appointment } from '@scheduling/shared';
import { useState, type ReactNode } from 'react';

import { ConfirmSurface } from '@/components/confirm-surface';

import type { AppointmentAction } from './appointment-action';

interface ActionRunner<Item extends Appointment> {
  readonly runningId: string | null;
  readonly start: (action: AppointmentAction<Item>) => void;
  readonly confirmation: ReactNode;
}

export function useActionRunner<Item extends Appointment>(appointment: Item): ActionRunner<Item> {
  const [confirming, setConfirming] = useState<AppointmentAction<Item> | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const execute = async (action: AppointmentAction<Item>) => {
    setRunningId(action.id);
    await action.run(appointment);
    setRunningId(null);
    setConfirming(null);
  };

  const start = (action: AppointmentAction<Item>) => {
    if (action.confirmation === undefined) void execute(action);
    else setConfirming(action);
  };

  const confirmation =
    confirming?.confirmation === undefined ? null : (
      <ConfirmSurface
        open
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={confirming.confirmation.title(appointment)}
        description={confirming.confirmation.description(appointment)}
        confirmLabel={confirming.confirmation.confirmLabel}
        pendingLabel={confirming.confirmation.pendingLabel}
        dismissLabel={confirming.confirmation.dismissLabel}
        tone={confirming.confirmation.tone}
        pending={runningId === confirming.id}
        onConfirm={() => {
          void execute(confirming);
        }}
      />
    );

  return { runningId, start, confirmation };
}
