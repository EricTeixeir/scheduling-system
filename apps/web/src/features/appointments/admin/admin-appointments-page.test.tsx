import type { AdminAppointment, AppointmentHistoryEntry } from '@scheduling/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { consecutiveDays } from '@/lib/time/local-date';
import { ADMIN_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const NOW = fixedClock('2026-10-07T15:00:00.000Z');
const ID = '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d';
const FROM_TODAY = 'GET /admin/appointments?page=1&pageSize=20&from=2026-10-07';
const STATUS = `POST /admin/appointments/${ID}/status`;
const SUMMARY = 'GET /admin/appointments/summary';

const summary = {
  todayConfirmed: 3,
  next7DaysConfirmed: 12,
  completedLast30Days: 40,
  noShowLast30Days: 2,
  cancelledLast30Days: 5,
};

type Handler = () => Response | Promise<Response>;

const started: AdminAppointment = {
  id: ID,
  startsAt: '2026-10-07T13:00:00.000Z',
  endsAt: '2026-10-07T13:30:00.000Z',
  status: 'CONFIRMED',
  notes: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  client: {
    id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
    name: 'Maria Silva',
    email: 'maria@example.com',
  },
};

const upcoming: AdminAppointment = {
  ...started,
  startsAt: '2026-10-07T18:00:00.000Z',
  endsAt: '2026-10-07T18:30:00.000Z',
};

function page(items: AdminAppointment[], total = items.length) {
  return () => jsonResponse({ items, page: 1, pageSize: 20, total });
}

function setup(routes: Record<string, Handler | Handler[]>, path = '/admin') {
  const user = userEvent.setup();
  const mock = createFetchMock({
    'GET /auth/me': () => jsonResponse(ADMIN_USER),
    [SUMMARY]: () => jsonResponse(summary),
    ...routes,
  });
  const view = renderApp({ path, fetch: mock.fetch, clock: NOW });
  return { user, ...mock, ...view };
}

async function cardOf(clientName: string) {
  const name = await screen.findByText(clientName);
  const card = name.closest('article');
  if (card === null) throw new Error(`No card for ${clientName}`);
  return card;
}

async function chooseAction(card: HTMLElement, label: string) {
  const user = userEvent.setup();
  await user.click(within(card).getByRole('button', { name: /^Ações para/ }));
  await user.click(await screen.findByRole('menuitem', { name: label }));
}

describe('AdminAppointmentsPage', () => {
  it('lists from today on by default, with date, time, client, status and a pager', async () => {
    setup({ [FROM_TODAY]: page([started], 45) });

    const card = await cardOf('Maria Silva');
    expect(within(card).getByText('Quarta, 7 de outubro')).toBeVisible();
    expect(within(card).getByText('10:00 – 10:30')).toBeVisible();
    expect(within(card).getByText('maria@example.com')).toBeVisible();
    expect(within(card).getByText('Confirmado')).toBeVisible();
    expect(screen.getByText('Página 1 de 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });

  it('shows the summary cards', async () => {
    setup({ [FROM_TODAY]: page([]) });

    const stats = within(await screen.findByLabelText('Resumo'))
      .getAllByRole('term')
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`);
    expect(stats).toEqual([
      'Hoje: 3',
      'Próximos 7 dias: 12',
      'Concluídos 30d: 40',
      'Faltas 30d: 2',
      'Cancelados 30d: 5',
    ]);
  });

  it('keeps the page usable when the summary fails, with a quiet retry', async () => {
    const { user } = setup({
      [FROM_TODAY]: page([started]),
      [SUMMARY]: [() => problemResponse(403, { code: 'FORBIDDEN' }), () => jsonResponse(summary)],
    });

    expect(await screen.findByText('Resumo indisponível.')).toBeVisible();
    expect(await cardOf('Maria Silva')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Recarregar' }));

    expect(await screen.findByLabelText('Resumo')).toBeVisible();
  });

  it('shows a friendly empty state', async () => {
    setup({ [FROM_TODAY]: page([]) });

    expect(await screen.findByText('Nenhum agendamento por aqui')).toBeVisible();
  });

  it('keeps the chosen view in the URL', async () => {
    const { user, router } = setup(
      {
        [FROM_TODAY]: page([started]),
        'GET /admin/appointments?page=1&pageSize=50&status=CONFIRMED&from=2026-10-07&to=2026-10-07':
          page([]),
        ...Object.fromEntries(
          consecutiveDays('2026-10-07', 7).map((date) => [
            `GET /availability?date=${date}`,
            () => jsonResponse({ date, timeZone: 'America/Sao_Paulo', slots: [] }),
          ]),
        ),
      },
      '/admin?visao=disponiveis',
    );

    expect(await screen.findByRole('tab', { name: 'Disponíveis' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Sem horários neste dia')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Agendados' }));

    expect(router.state.location.search).toBe('?visao=agendados');
    expect(await cardOf('Maria Silva')).toBeVisible();
  });

  it('completes an appointment and refreshes the list', async () => {
    const { callsTo } = setup({
      [FROM_TODAY]: [page([started]), page([{ ...started, status: 'COMPLETED' }])],
      [STATUS]: () => jsonResponse({ ...started, status: 'COMPLETED' }),
    });

    const card = await cardOf('Maria Silva');
    await chooseAction(card, 'Concluir');

    expect(await screen.findByText('Atendimento concluído.')).toBeVisible();
    expect(callsTo('POST', `/admin/appointments/${ID}/status`)[0]?.body).toEqual({
      status: 'COMPLETED',
    });
    await waitFor(() => {
      expect(within(card).getByText('Concluído')).toBeVisible();
    });
  });

  it('cancels only after confirmation', async () => {
    const { user, callsTo } = setup({
      [FROM_TODAY]: page([upcoming]),
      [STATUS]: () => jsonResponse({ ...upcoming, status: 'CANCELLED' }),
    });

    await chooseAction(await cardOf('Maria Silva'), 'Cancelar');
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancelar o agendamento de Maria Silva?',
    });
    expect(callsTo('POST', `/admin/appointments/${ID}/status`)).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));

    expect(await screen.findByText('Agendamento cancelado.')).toBeVisible();
    expect(callsTo('POST', `/admin/appointments/${ID}/status`)[0]?.body).toEqual({
      status: 'CANCELLED',
    });
  });

  it('explains a refused change (422 NOT_STARTED_YET)', async () => {
    setup({
      [FROM_TODAY]: page([started]),
      [STATUS]: () => problemResponse(422, { code: 'NOT_STARTED_YET' }),
    });

    await chooseAction(await cardOf('Maria Silva'), 'Concluir');

    expect(
      await screen.findByText(
        'O atendimento ainda não começou. Registre o resultado depois do horário marcado.',
      ),
    ).toBeVisible();
  });

  it('shows the history timeline in a side sheet', async () => {
    const entry = (overrides: Partial<AppointmentHistoryEntry>): AppointmentHistoryEntry => ({
      id: '7c2f7b5d-3e4a-4b6c-9d7e-8f9a0b1c2d3e',
      occurredAt: '2026-10-01T12:00:00.000Z',
      action: 'APPOINTMENT_CREATED',
      fromStatus: null,
      toStatus: 'CONFIRMED',
      actor: { id: started.client.id, name: 'Maria Silva', role: 'CLIENT' },
      ...overrides,
    });
    setup({
      [FROM_TODAY]: page([started]),
      [`GET /admin/appointments/${ID}/history`]: () =>
        jsonResponse({
          items: [
            entry({}),
            entry({
              id: '8d3a8c6e-4f5b-4c7d-8e9f-0a1b2c3d4e5f',
              occurredAt: '2026-10-07T13:40:00.000Z',
              action: 'APPOINTMENT_NO_SHOW',
              fromStatus: 'CONFIRMED',
              toStatus: 'NO_SHOW',
              actor: { id: ADMIN_USER.id, name: 'Ana Admin', role: 'ADMIN' },
            }),
          ],
        }),
    });

    await chooseAction(await cardOf('Maria Silva'), 'Ver histórico');

    const sheet = await screen.findByRole('dialog', { name: 'Histórico' });
    const events = await within(sheet).findAllByRole('listitem');
    expect(events.map((event) => event.textContent)).toEqual([
      'Agendamento criadoMaria Silva · ClienteQuinta, 1 de outubro às 09:00',
      'Cliente não compareceuAna Admin · AdministradorQuarta, 7 de outubro às 10:40',
    ]);
  });

  it('shows an error with a retry when the list cannot be loaded', async () => {
    const { user } = setup({
      [FROM_TODAY]: [() => problemResponse(403, { code: 'FORBIDDEN' }), page([started])],
    });

    expect(await screen.findByText('Não foi possível carregar os agendamentos')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await cardOf('Maria Silva')).toBeVisible();
  });
});
