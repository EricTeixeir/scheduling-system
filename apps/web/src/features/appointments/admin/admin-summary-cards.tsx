import type { AdminSummary } from '@scheduling/shared';
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { useAdminSummary } from './use-admin-appointments';

interface SummaryStat {
  readonly label: string;
  readonly valueOf: (summary: AdminSummary) => number;
}

const SUMMARY_STATS: readonly SummaryStat[] = [
  { label: 'Hoje', valueOf: (summary) => summary.todayConfirmed },
  { label: 'Próximos 7 dias', valueOf: (summary) => summary.next7DaysConfirmed },
  { label: 'Concluídos 30d', valueOf: (summary) => summary.completedLast30Days },
  { label: 'Faltas 30d', valueOf: (summary) => summary.noShowLast30Days },
  { label: 'Cancelados 30d', valueOf: (summary) => summary.cancelledLast30Days },
];

const GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-5';
const CARD_CLASSES = 'rounded-xl border bg-card p-3 shadow-sm sm:p-4';

export function AdminSummaryCards() {
  const summary = useAdminSummary();

  if (summary.isPending) {
    return (
      <div role="status" aria-live="polite" className={GRID_CLASSES}>
        <span className="sr-only">Carregando resumo…</span>
        {SUMMARY_STATS.map(({ label }) => (
          <div key={label} className={cn(CARD_CLASSES, 'space-y-2')}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
    );
  }
  if (summary.isError) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        Resumo indisponível.
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void summary.refetch();
          }}
        >
          <RotateCw aria-hidden="true" />
          Recarregar
        </Button>
      </p>
    );
  }
  return (
    <dl aria-label="Resumo" className={GRID_CLASSES}>
      {SUMMARY_STATS.map(({ label, valueOf }) => (
        <div key={label} className={CARD_CLASSES}>
          <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{valueOf(summary.data)}</dd>
        </div>
      ))}
    </dl>
  );
}
