import type { Slot } from '@scheduling/shared';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatTime, formatTimeRange } from '@/lib/time/format';

import type { SlotGroup } from './day-periods';

interface SlotButtonProps {
  readonly slot: Slot;
  readonly timeZone: string;
  readonly onSelect: (slot: Slot) => void;
}

export function SlotButton({ slot, timeZone, onSelect }: SlotButtonProps) {
  return (
    <Button
      variant="outline"
      title={formatTimeRange(slot.startsAt, slot.endsAt, timeZone)}
      className="h-11 w-full font-semibold tabular-nums hover:border-primary hover:bg-accent hover:text-primary"
      onClick={() => {
        onSelect(slot);
      }}
    >
      {formatTime(slot.startsAt, timeZone)}
    </Button>
  );
}

interface SlotGridProps {
  readonly groups: readonly SlotGroup[];
  readonly timeZone: string;
  readonly onSelect: (slot: Slot) => void;
}

export function SlotGrid({ groups, timeZone, onSelect }: SlotGridProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <SlotGroupSection
          key={group.period.id}
          group={group}
          timeZone={timeZone}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SlotGroupSection({
  group: { period, slots },
  timeZone,
  onSelect,
}: {
  readonly group: SlotGroup;
  readonly timeZone: string;
  readonly onSelect: (slot: Slot) => void;
}) {
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
            <SlotButton slot={slot} timeZone={timeZone} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}
