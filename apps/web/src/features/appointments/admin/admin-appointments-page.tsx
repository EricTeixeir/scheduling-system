import type { AdminAppointment, AdminAppointmentsQueryInput } from '@scheduling/shared';
import { CalendarSearch, ChevronLeft, ChevronRight, CloudOff } from 'lucide-react';
import { useState } from 'react';

import { InlineState } from '@/components/states/inline-state';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { localDateOf } from '@/lib/time/local-date';
import { cn } from '@/lib/utils';

import { AppointmentListSkeleton } from '../my-appointments/appointment-list';
import { useAdminAppointmentActions } from './admin-appointment-actions';
import { AdminAppointmentFilters } from './admin-appointment-filters';
import { AdminAppointmentList } from './admin-appointment-list';
import { periodRange, type Period, type StatusFilter } from './admin-appointment-period';
import { pageCountOf } from './admin-appointments-api';
import { AppointmentHistorySheet } from './appointment-history-sheet';
import { useAdminAppointments } from './use-admin-appointments';

const SEARCH_DEBOUNCE_MS = 300;

export function AdminAppointmentsPage() {
  const clock = useClock();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [period, setPeriod] = useState<Period>('week');
  const [page, setPage] = useState(1);
  const [historyFor, setHistoryFor] = useState<AdminAppointment | null>(null);
  const actions = useAdminAppointmentActions(setHistoryFor);
  const q = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const query: AdminAppointmentsQueryInput = {
    page,
    ...periodRange(period, localDateOf(clock.now(), BUSINESS_TIME_ZONE)),
    ...(status === 'ALL' ? {} : { status }),
    ...(q === '' ? {} : { q }),
  };
  const appointments = useAdminAppointments(query);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Acompanhe a agenda, registre o resultado dos atendimentos e cancele quando precisar.
        </p>
      </header>
      <AdminAppointmentFilters
        search={search}
        status={status}
        period={period}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        onStatusChange={(next) => {
          setStatus(next);
          setPage(1);
        }}
        onPeriodChange={(next) => {
          setPeriod(next);
          setPage(1);
        }}
      />
      {appointments.isPending ? (
        <AppointmentListSkeleton />
      ) : appointments.isError ? (
        <InlineState
          icon={CloudOff}
          tone="destructive"
          title="Não foi possível carregar os agendamentos"
          description={messageFor(appointments.error)}
          action={
            <Button
              variant="outline"
              onClick={() => {
                void appointments.refetch();
              }}
            >
              Tentar novamente
            </Button>
          }
        />
      ) : appointments.data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card">
          <InlineState
            icon={CalendarSearch}
            title="Nenhum agendamento encontrado"
            description="Ajuste a busca, o status ou o período para ver outros agendamentos."
          />
        </div>
      ) : (
        <div
          className={cn(
            'space-y-4 transition-opacity',
            appointments.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={appointments.isPlaceholderData}
        >
          <AdminAppointmentList
            appointments={appointments.data.items}
            actions={actions}
            now={clock.now()}
            timeZone={BUSINESS_TIME_ZONE}
          />
          <Pager
            page={appointments.data.page}
            pageCount={pageCountOf(appointments.data)}
            disabled={appointments.isPlaceholderData}
            onPageChange={setPage}
          />
        </div>
      )}
      <AppointmentHistorySheet
        appointment={historyFor}
        onClose={() => {
          setHistoryFor(null);
        }}
      />
    </div>
  );
}

interface PagerProps {
  readonly page: number;
  readonly pageCount: number;
  readonly disabled: boolean;
  readonly onPageChange: (page: number) => void;
}

function Pager({ page, pageCount, disabled, onPageChange }: PagerProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        disabled={disabled || page <= 1}
        onClick={() => {
          onPageChange(page - 1);
        }}
      >
        <ChevronLeft aria-hidden="true" />
        Anterior
      </Button>
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        Página {page} de {pageCount}
      </p>
      <Button
        variant="outline"
        disabled={disabled || page >= pageCount}
        onClick={() => {
          onPageChange(page + 1);
        }}
      >
        Próxima
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
