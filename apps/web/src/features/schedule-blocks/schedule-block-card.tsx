import type { ScheduleBlock } from '@scheduling/shared';
import { CalendarRange, StickyNote, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmSurface } from '@/components/confirm-surface';
import { Button } from '@/components/ui/button';
import { formatDayMonth } from '@/lib/time/format';

import { useDeleteScheduleBlock } from './use-schedule-blocks';
import { weekdayShortName, weekdaysIn } from './weekdays';

function timeRangeOf(block: ScheduleBlock): string {
  return `${block.startTime} – ${block.endTime}`;
}

function validityOf(block: ScheduleBlock): string {
  const since = `A partir de ${formatDayMonth(block.startsOn)}`;
  return block.endsOn === null
    ? `${since} · Sem data de término`
    : `${since} até ${formatDayMonth(block.endsOn)}`;
}

export function ScheduleBlockCard({ block }: { readonly block: ScheduleBlock }) {
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteScheduleBlock();
  const weekdays = weekdaysIn(block.weekdays);

  const confirmRemoval = async () => {
    const removed = await remove.mutateAsync(block.id).then(
      () => true,
      () => false,
    );
    if (removed) toast.success('Bloqueio removido.');
    setConfirming(false);
  };

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h3 id={titleId} className="text-lg font-semibold tracking-tight tabular-nums">
            {timeRangeOf(block)}
          </h3>
          <ul aria-label="Dias da semana" className="flex flex-wrap gap-1.5">
            {weekdays.map((weekday) => (
              <li
                key={weekday}
                className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                {weekdayShortName(weekday)}
              </li>
            ))}
          </ul>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive md:h-9"
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Remover
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
        {validityOf(block)}
      </p>
      {block.reason === null ? null : (
        <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-sm break-words">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="sr-only">Motivo: </span>
            {block.reason}
          </span>
        </p>
      )}
      <ConfirmSurface
        open={confirming}
        onOpenChange={setConfirming}
        title="Remover este bloqueio?"
        description={`${timeRangeOf(block)} · ${weekdays.map(weekdayShortName).join(', ')}. Os horários voltam a ficar disponíveis para agendamento.`}
        confirmLabel="Remover bloqueio"
        pendingLabel="Removendo…"
        dismissLabel="Voltar"
        tone="destructive"
        pending={remove.isPending}
        onConfirm={() => {
          void confirmRemoval();
        }}
      />
    </article>
  );
}
