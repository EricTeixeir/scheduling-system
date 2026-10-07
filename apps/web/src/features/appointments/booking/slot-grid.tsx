import type { Slot } from '@scheduling/shared';
import { CalendarCheck, UserRound } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatTime, formatTimeRange } from '@/lib/time/format';
import { cn } from '@/lib/utils';

import type { GridSlot, OccupiedSlot, SlotGroup } from './day-periods';

interface SlotGridProps {
  readonly groups: readonly SlotGroup[];
  readonly timeZone: string;
  readonly selectedStartsAt: string | null;
  readonly onSelect: (slot: Slot) => void;
  readonly onOpenMine?: ((appointmentId: string) => void) | undefined;
  readonly onOpenBooked?: ((appointmentId: string) => void) | undefined;
}

type SlotCellProps = Omit<SlotGridProps, 'groups'>;

export function SlotButton({ slot, ...props }: SlotCellProps & { readonly slot: GridSlot }) {
  switch (slot.kind) {
    case 'free':
      return <FreeSlotButton slot={slot} {...props} />;
    case 'mine':
      return <MySlotButton slot={slot} {...props} />;
    case 'booked':
      return <BookedSlotButton slot={slot} {...props} />;
  }
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

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function BookedSlotButton({
  slot,
  timeZone,
  onOpenBooked,
}: SlotCellProps & { readonly slot: Extract<GridSlot, { kind: 'booked' }> }) {
  const time = formatTime(slot.startsAt, timeZone);
  return (
    <Button
      variant="outline"
      aria-label={`${time}, agendado por ${slot.clientName}. Ver histórico`}
      title={`Agendado por ${slot.clientName}`}
      className="h-11 w-full flex-col gap-0.5 border-dashed bg-muted px-2 py-0 text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:bg-muted dark:hover:bg-muted/70"
      onClick={() => {
        onOpenBooked?.(slot.appointmentId);
      }}
    >
      <span className="flex items-center gap-1 text-sm leading-4 font-semibold tabular-nums">
        <UserRound className="size-3.5" aria-hidden="true" />
        {time}
      </span>
      <span className="max-w-full truncate text-[11px] leading-3 font-normal">
        {firstNameOf(slot.clientName)}
      </span>
    </Button>
  );
}

interface Legend {
  readonly kind: OccupiedSlot['kind'];
  readonly label: string;
  readonly swatch: string;
}

const LEGENDS: readonly Legend[] = [
  { kind: 'mine', label: 'Seus agendamentos neste dia', swatch: 'border-primary bg-primary/10' },
  { kind: 'booked', label: 'Horários agendados', swatch: 'border-dashed bg-muted' },
];

function SlotLegend({ groups }: { readonly groups: readonly SlotGroup[] }) {
  const kinds = new Set(groups.flatMap((group) => group.slots.map((slot) => slot.kind)));
  const shown = LEGENDS.filter((legend) => kinds.has(legend.kind));
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {shown.map(({ kind, label, swatch }) => (
        <li key={kind} className="flex items-center gap-2">
          <span className={cn('size-3 rounded-sm border', swatch)} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function SlotGrid({ groups, ...props }: SlotGridProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <SlotGroupSection key={group.period.id} group={group} {...props} />
      ))}
      <SlotLegend groups={groups} />
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
