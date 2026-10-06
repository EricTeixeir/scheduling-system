import type { Appointment } from '@scheduling/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { ConfirmSurface } from '@/components/confirm-surface';
import { Button } from '@/components/ui/button';

import { availableActions, type AppointmentAction } from './appointment-action';

interface AppointmentActionsProps<Item extends Appointment> {
  readonly appointment: Item;
  readonly actions: readonly AppointmentAction<Item>[];
  readonly now: Date;
}

export function AppointmentActions<Item extends Appointment>({
  appointment,
  actions,
  now,
}: AppointmentActionsProps<Item>) {
  const [confirming, setConfirming] = useState<AppointmentAction<Item> | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const visible = availableActions(actions, appointment, now);
  if (visible.length === 0) return null;

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

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((action) => {
        const Icon = action.icon;
        const running = runningId === action.id;
        return (
          <Button
            key={action.id}
            variant={action.variant}
            size="sm"
            className="h-10 md:h-9"
            disabled={runningId !== null}
            onClick={() => {
              start(action);
            }}
          >
            {running ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Icon aria-hidden="true" />
            )}
            {action.label}
          </Button>
        );
      })}
      {confirming?.confirmation === undefined ? null : (
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
      )}
    </div>
  );
}
