import { APPOINTMENT_SCOPES, type AppointmentScope } from '@scheduling/shared';
import { CalendarPlus, CalendarSearch, CloudOff, LoaderCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { PATHS } from '@/app/navigation';
import { InlineState } from '@/components/states/inline-state';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageFor } from '@/lib/errors/messages';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';

import type { AppointmentAction } from '../shared/appointment-action';
import { AppointmentActions } from '../shared/appointment-actions';
import { AppointmentList, AppointmentListSkeleton } from './appointment-list';
import { HIGHLIGHT_PARAM } from './highlight';
import { useClientAppointmentActions } from './client-appointment-actions';
import { useMyAppointments } from './use-my-appointments';

interface ScopeView {
  readonly slug: string;
  readonly tabLabel: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

const SCOPE_VIEWS: Readonly<Record<AppointmentScope, ScopeView>> = {
  upcoming: {
    slug: 'proximos',
    tabLabel: 'Próximos',
    emptyTitle: 'Nenhum agendamento próximo',
    emptyDescription: 'Escolha um dia e um horário para marcar seu próximo atendimento.',
  },
  past: {
    slug: 'anteriores',
    tabLabel: 'Anteriores',
    emptyTitle: 'Nenhum agendamento anterior',
    emptyDescription: 'Seus atendimentos passados aparecem aqui.',
  },
};

const SCOPE_PARAM = 'aba';

function viewOf(scope: AppointmentScope): ScopeView {
  // eslint-disable-next-line security/detect-object-injection -- scope is a typed AppointmentScope, never free-form input.
  return SCOPE_VIEWS[scope];
}

function scopeFromSlug(slug: string | null): AppointmentScope {
  return APPOINTMENT_SCOPES.find((scope) => viewOf(scope).slug === slug) ?? 'upcoming';
}

export function MyAppointmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeScope = scopeFromSlug(searchParams.get(SCOPE_PARAM));
  const highlightedId = searchParams.get(HIGHLIGHT_PARAM);
  const actions = useClientAppointmentActions();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Meus agendamentos</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Acompanhe seus horários e cancele quando precisar.
          </p>
        </div>
        <Button asChild className="hidden sm:inline-flex">
          <Link to={PATHS.book}>
            <CalendarPlus aria-hidden="true" />
            Novo agendamento
          </Link>
        </Button>
      </header>
      <Tabs
        value={activeScope}
        onValueChange={(value) => {
          setSearchParams(
            { [SCOPE_PARAM]: viewOf(scopeFromValue(value)).slug },
            {
              replace: true,
            },
          );
        }}
        className="gap-4"
      >
        <TabsList className="w-full sm:w-fit">
          {APPOINTMENT_SCOPES.map((scope) => (
            <TabsTrigger key={scope} value={scope} className="sm:px-6">
              {viewOf(scope).tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
        {APPOINTMENT_SCOPES.map((scope) => (
          <TabsContent key={scope} value={scope}>
            <ScopedAppointments scope={scope} actions={actions} highlightedId={highlightedId} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function scopeFromValue(value: string): AppointmentScope {
  return APPOINTMENT_SCOPES.find((scope) => scope === value) ?? 'upcoming';
}

interface ScopedAppointmentsProps {
  readonly scope: AppointmentScope;
  readonly actions: readonly AppointmentAction[];
  readonly highlightedId: string | null;
}

function ScopedAppointments({ scope, actions, highlightedId }: ScopedAppointmentsProps) {
  const clock = useClock();
  const appointments = useMyAppointments(scope);

  if (appointments.isPending) return <AppointmentListSkeleton />;
  if (appointments.isError) {
    return (
      <InlineState
        icon={CloudOff}
        tone="destructive"
        title="Não foi possível carregar seus agendamentos"
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
    );
  }

  const items = appointments.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    const view = viewOf(scope);
    return (
      <div className="rounded-xl border border-dashed bg-card">
        <InlineState
          icon={CalendarSearch}
          title={view.emptyTitle}
          description={view.emptyDescription}
          action={
            <Button asChild>
              <Link to={PATHS.book}>
                <CalendarPlus aria-hidden="true" />
                Agendar horário
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const now = clock.now();
  return (
    <div className="space-y-4">
      <AppointmentList
        appointments={items}
        timeZone={BUSINESS_TIME_ZONE}
        highlightedId={highlightedId}
        renderActions={(appointment) => (
          <AppointmentActions appointment={appointment} actions={actions} now={now} />
        )}
      />
      {appointments.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={appointments.isFetchingNextPage}
            onClick={() => {
              void appointments.fetchNextPage();
            }}
          >
            {appointments.isFetchingNextPage ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Carregando…
              </>
            ) : (
              'Carregar mais'
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
