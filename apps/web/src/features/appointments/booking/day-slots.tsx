import type { Slot } from '@scheduling/shared';
import { CalendarX2, CloudOff } from 'lucide-react';

import { InlineState } from '@/components/states/inline-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import type { SlotGroup } from './day-periods';
import { SlotGrid } from './slot-grid';

export type DaySlotsState =
  | { readonly status: 'pending' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly groups: readonly SlotGroup[]; readonly timeZone: string };

interface DaySlotsProps {
  readonly state: DaySlotsState;
  readonly selectedStartsAt: string | null;
  readonly onSelectSlot: (slot: Slot) => void;
  readonly onOpenMine?: ((appointmentId: string) => void) | undefined;
  readonly onRetry: () => void;
  readonly onNextDay: () => void;
}

export function DaySlots({
  state,
  selectedStartsAt,
  onSelectSlot,
  onOpenMine,
  onRetry,
  onNextDay,
}: DaySlotsProps) {
  if (state.status === 'pending') return <DaySlotsSkeleton />;
  if (state.status === 'error') {
    return (
      <InlineState
        icon={CloudOff}
        tone="destructive"
        title="Não foi possível carregar os horários"
        description={state.message}
        action={
          <Button variant="outline" onClick={onRetry}>
            Tentar novamente
          </Button>
        }
      />
    );
  }
  if (state.groups.length === 0) {
    return (
      <InlineState
        icon={CalendarX2}
        title="Sem horários neste dia"
        description="Não há horários livres nesta data. Que tal o dia seguinte?"
        action={<Button onClick={onNextDay}>Ver próximo dia</Button>}
      />
    );
  }
  return (
    <SlotGrid
      groups={state.groups}
      timeZone={state.timeZone}
      selectedStartsAt={selectedStartsAt}
      onSelect={onSelectSlot}
      onOpenMine={onOpenMine}
    />
  );
}

function DaySlotsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Carregando horários…</span>
      {[6, 4].map((count, group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: count }, (_, index) => (
              <Skeleton key={index} className="h-11 rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
