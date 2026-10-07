import { CalendarOff, CloudOff, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { InlineState } from '@/components/states/inline-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { localDateOf } from '@/lib/time/local-date';

import { ScheduleBlockCard } from './schedule-block-card';
import { ScheduleBlockForm } from './schedule-block-form';
import { useScheduleBlocks } from './use-schedule-blocks';

export function ScheduleBlocksPage() {
  const clock = useClock();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bloqueios</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Reserve horários recorrentes em que você não atende, como almoço ou reuniões.
          </p>
        </div>
        <Button
          variant={isCreating ? 'outline' : 'default'}
          aria-expanded={isCreating}
          onClick={() => {
            setIsCreating((open) => !open);
          }}
        >
          {isCreating ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isCreating ? 'Fechar formulário' : 'Novo bloqueio'}
        </Button>
      </header>
      {isCreating ? (
        <ScheduleBlockForm
          today={localDateOf(clock.now(), BUSINESS_TIME_ZONE)}
          onCreated={() => {
            setIsCreating(false);
          }}
        />
      ) : null}
      <section aria-labelledby="schedule-blocks-title" className="space-y-3">
        <h2 id="schedule-blocks-title" className="sr-only">
          Bloqueios cadastrados
        </h2>
        <ScheduleBlockList />
      </section>
    </div>
  );
}

function ScheduleBlockList() {
  const blocks = useScheduleBlocks();

  if (blocks.isPending) {
    return (
      <div role="status" aria-live="polite" className="grid gap-3 md:grid-cols-2">
        <span className="sr-only">Carregando bloqueios…</span>
        {[0, 1].map((index) => (
          <div key={index} className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-48 rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        ))}
      </div>
    );
  }
  if (blocks.isError) {
    return (
      <InlineState
        icon={CloudOff}
        tone="destructive"
        title="Não foi possível carregar os bloqueios"
        description={messageFor(blocks.error)}
        action={
          <Button
            variant="outline"
            onClick={() => {
              void blocks.refetch();
            }}
          >
            Tentar novamente
          </Button>
        }
      />
    );
  }
  if (blocks.data.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card">
        <InlineState
          icon={CalendarOff}
          title="Nenhum bloqueio cadastrado"
          description="Todos os horários de atendimento estão abertos para agendamento."
        />
      </div>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {blocks.data.items.map((block) => (
        <li key={block.id}>
          <ScheduleBlockCard block={block} />
        </li>
      ))}
    </ul>
  );
}
