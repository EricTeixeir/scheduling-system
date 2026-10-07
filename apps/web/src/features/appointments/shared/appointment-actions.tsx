import type { Appointment } from '@scheduling/shared';
import { EllipsisVertical, LoaderCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { availableActions, type AppointmentAction } from './appointment-action';
import { useActionRunner } from './use-action-runner';

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
  const { runningId, start, confirmation } = useActionRunner(appointment);
  const visible = availableActions(actions, appointment, now);
  if (visible.length === 0) return null;

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
      {confirmation}
    </div>
  );
}

interface AppointmentActionsMenuProps<
  Item extends Appointment,
> extends AppointmentActionsProps<Item> {
  readonly label: string;
}

export function AppointmentActionsMenu<Item extends Appointment>({
  appointment,
  actions,
  now,
  label,
}: AppointmentActionsMenuProps<Item>) {
  const { runningId, start, confirmation } = useActionRunner(appointment);
  const visible = availableActions(actions, appointment, now);
  if (visible.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} disabled={runningId !== null}>
            {runningId === null ? (
              <EllipsisVertical aria-hidden="true" />
            ) : (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {visible.map((action) => {
            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.id}
                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                onSelect={() => {
                  start(action);
                }}
              >
                <Icon aria-hidden="true" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmation}
    </>
  );
}
