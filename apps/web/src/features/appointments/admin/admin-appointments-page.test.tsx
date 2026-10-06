import type { AdminAppointment, AppointmentHistoryEntry } from '@scheduling/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ADMIN_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const NOW = fixedClock('2026-10-07T15:00:00.000Z');
const ID = '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d';
const THIS_WEEK = 'GET /admin/appointments?page=1&pageSize=20&from=2026-10-07&to=2026-10-13';
const STATUS = `POST /admin/appointments/${ID}/status`;

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

function setup(routes: Record<string, Handler | Handler[]>) {
  const user = userEvent.setup();
  const mock = createFetchMock({ 'GET /auth/me': () => jsonResponse(ADMIN_USER), ...routes });
  const view = renderApp({ path: '/admin', fetch: mock.fetch, clock: NOW });
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
  it('lists the week with date, time, client, status and a pager', async () => {
    setup({ [THIS_WEEK]: page([started], 45) });

    const card = await cardOf('Maria Silva');
    expect(within(card).getByText('Quarta, 7 de outubro')).toBeVisible();
    expect(within(card).getByText('10:00 – 10:30')).toBeVisible();
    expect(within(card).getByText('maria@example.com')).toBeVisible();
    expect(within(card).getByText('Confirmado')).toBeVisible();
    expect(screen.getByText('Página 1 de 3')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });

  it('completes an appointment and refreshes the list', async () => {
    const { callsTo } = setup({
      [THIS_WEEK]: [page([started]), page([{ ...started, status: 'COMPLETED' }])],
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
      [THIS_WEEK]: page([upcoming]),
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
      [THIS_WEEK]: page([started]),
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
      [THIS_WEEK]: page([started]),
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
      [THIS_WEEK]: [() => problemResponse(403, { code: 'FORBIDDEN' }), page([started])],
    });

    expect(await screen.findByText('Não foi possível carregar os agendamentos')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await cardOf('Maria Silva')).toBeVisible();
  });
});
