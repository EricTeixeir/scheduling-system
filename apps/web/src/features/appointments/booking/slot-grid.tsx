import type { Slot } from '@scheduling/shared';
import { CalendarCheck } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatTime, formatTimeRange } from '@/lib/time/format';
import { cn } from '@/lib/utils';

import type { GridSlot, SlotGroup } from './day-periods';

interface SlotGridProps {
  readonly groups: readonly SlotGroup[];
  readonly timeZone: string;
  readonly selectedStartsAt: string | null;
  readonly onSelect: (slot: Slot) => void;
  readonly onOpenMine?: ((appointmentId: string) => void) | undefined;
}

type SlotCellProps = Omit<SlotGridProps, 'groups'>;

export function SlotButton({ slot, ...props }: SlotCellProps & { readonly slot: GridSlot }) {
  return slot.kind === 'mine' ? (
    <MySlotButton slot={slot} {...props} />
  ) : (
    <FreeSlotButton slot={slot} {...props} />
  );
}

function FreeSlotButton({
  slot,
  timeZone,
  selectedStartsAt,
  onSelect,
}: SlotCellProps & { readonly slot: Slot }) {
  const selected = slot.startsAt === selectedStartsAt;
  return (
    <Button
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      title={formatTimeRange(slot.startsAt, slot.endsAt, timeZone)}
      className={cn(
        'h-11 w-full font-semibold tabular-nums',
        selected
          ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
          : 'hover:border-primary hover:bg-accent hover:text-primary',
      )}
      onClick={() => {
        onSelect(slot);
      }}
    >
      {formatTime(slot.startsAt, timeZone)}
    </Button>
  );
}

function MySlotButton({
  slot,
  timeZone,
  onOpenMine,
}: SlotCellProps & { readonly slot: Extract<GridSlot, { kind: 'mine' }> }) {
  const time = formatTime(slot.startsAt, timeZone);
  return (
    <Button
      variant="outline"
      aria-label={`${time}, seu agendamento. Ver em Meus agendamentos`}
      title="Seu agendamento"
      className="h-11 w-full gap-1.5 border-primary bg-primary/10 font-semibold text-primary tabular-nums hover:bg-primary/15 hover:text-primary"
      onClick={() => {
        onOpenMine?.(slot.appointmentId);
      }}
    >
      <CalendarCheck className="size-4" aria-hidden="true" />
      {time}
    </Button>
  );
}

export function SlotGrid({ groups, ...props }: SlotGridProps) {
  const hasMine = groups.some((group) => group.slots.some((slot) => slot.kind === 'mine'));
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <SlotGroupSection key={group.period.id} group={group} {...props} />
      ))}
      {hasMine ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="size-3 rounded-sm border border-primary bg-primary/10"
            aria-hidden="true"
          />
          Seus agendamentos neste dia
        </p>
      ) : null}
    </div>
  );
}

function SlotGroupSection({
  group: { period, slots },
  ...props
}: SlotCellProps & { readonly group: SlotGroup }) {
  const headingId = useId();
  const Icon = period.icon;
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground"
      >
        <Icon className="size-4" aria-hidden="true" />
        {period.label}
        <span className="text-xs font-normal">· {slots.length}</span>
      </h3>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
        {slots.map((slot) => (
          <li key={slot.startsAt}>
            <SlotButton slot={slot} {...props} />
          </li>
        ))}
      </ul>
    </section>
  );
}
