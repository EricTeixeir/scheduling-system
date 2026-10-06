import type { Appointment, AppointmentStatus } from '@scheduling/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CLIENT_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const NOW = fixedClock('2026-10-07T12:00:00.000Z');
const UPCOMING = 'GET /appointments?scope=upcoming&page=1&pageSize=20';
const PAST = 'GET /appointments?scope=past&page=1&pageSize=20';
const CONFIRMED_ID = '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d';
const CANCEL = `POST /appointments/${CONFIRMED_ID}/cancel`;

type Handler = () => Response | Promise<Response>;

function appointment(
  overrides: Partial<Appointment> & { readonly status?: AppointmentStatus },
): Appointment {
  return {
    id: CONFIRMED_ID,
    startsAt: '2026-10-07T13:00:00.000Z',
    endsAt: '2026-10-07T13:30:00.000Z',
    status: 'CONFIRMED',
    notes: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

const confirmed = appointment({ notes: 'Trazer exames' });
const cancelledLater = appointment({
  id: '7c2f7b5d-3e4a-4b6c-9d7e-8f9a0b1c2d3e',
  startsAt: '2026-10-09T17:00:00.000Z',
  endsAt: '2026-10-09T17:30:00.000Z',
  status: 'CANCELLED',
});

function page(
  items: Appointment[],
  extra: { page?: number; pageSize?: number; total?: number } = {},
) {
  return () => jsonResponse({ items, page: 1, pageSize: 20, total: items.length, ...extra });
}

function setup(routes: Record<string, Handler | Handler[]>, path = '/meus-agendamentos') {
  const user = userEvent.setup();
  const mock = createFetchMock({ 'GET /auth/me': () => jsonResponse(CLIENT_USER), ...routes });
  const view = renderApp({ path, fetch: mock.fetch, clock: NOW });
  return { user, ...mock, ...view };
}

async function cardFor(title: string) {
  const heading = await screen.findByRole('heading', { name: title });
  const card = heading.closest('article');
  if (card === null) throw new Error(`No card for ${title}`);
  return card;
}

describe('MyAppointmentsPage', () => {
  it('lists upcoming appointments with status, time, notes and the cancel action', async () => {
    setup({ [UPCOMING]: page([confirmed, cancelledLater]) });

    const confirmedCard = await cardFor('Quarta, 7 de outubro');
    expect(within(confirmedCard).getByText('10:00 – 10:30')).toBeVisible();
    expect(within(confirmedCard).getByText('Confirmado')).toBeVisible();
    expect(within(confirmedCard).getByText('Trazer exames')).toBeVisible();
    expect(within(confirmedCard).getByRole('button', { name: 'Cancelar' })).toBeVisible();

    const cancelledCard = await cardFor('Sexta, 9 de outubro');
    expect(within(cancelledCard).getByText('Cancelado')).toBeVisible();
    expect(within(cancelledCard).queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('cancels after confirmation and refreshes the list', async () => {
    const { user, callsTo } = setup({
      [UPCOMING]: [page([confirmed]), page([{ ...confirmed, status: 'CANCELLED' }])],
      [CANCEL]: () => jsonResponse({ ...confirmed, status: 'CANCELLED' }),
    });

    const card = await cardFor('Quarta, 7 de outubro');
    await user.click(within(card).getByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Cancelar o agendamento de quarta às 10:00?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));

    expect(await screen.findByText('Agendamento cancelado.')).toBeVisible();
    expect(callsTo('POST', `/appointments/${CONFIRMED_ID}/cancel`)).toHaveLength(1);
    await waitFor(() => {
      expect(within(card).getByText('Cancelado')).toBeVisible();
    });
    expect(within(card).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the appointment when the confirmation is dismissed', async () => {
    const { user, callsTo } = setup({ [UPCOMING]: page([confirmed]) });

    const card = await cardFor('Quarta, 7 de outubro');
    await user.click(within(card).getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Voltar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(callsTo('POST', `/appointments/${CONFIRMED_ID}/cancel`)).toHaveLength(0);
  });

  it('explains when the cancellation deadline has passed (422 CANCEL_DEADLINE_PASSED)', async () => {
    const { user } = setup({
      [UPCOMING]: page([confirmed]),
      [CANCEL]: () => problemResponse(422, { code: 'CANCEL_DEADLINE_PASSED' }),
    });

    const card = await cardFor('Quarta, 7 de outubro');
    await user.click(within(card).getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar agendamento' }));

    expect(
      await screen.findByText('O prazo para cancelar este agendamento já terminou.'),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(within(card).getByText('Confirmado')).toBeVisible();
  });

  it('shows past appointments in their own tab, without actions', async () => {
    const completed = appointment({
      id: '8d3a8c6e-4f5b-4c7d-8e9f-0a1b2c3d4e5f',
      startsAt: '2026-10-01T13:00:00.000Z',
      endsAt: '2026-10-01T13:30:00.000Z',
      status: 'COMPLETED',
    });
    const { user, router } = setup({ [UPCOMING]: page([confirmed]), [PAST]: page([completed]) });

    await user.click(await screen.findByRole('tab', { name: 'Anteriores' }));

    const card = await cardFor('Quinta, 1 de outubro');
    expect(within(card).getByText('Concluído')).toBeVisible();
    expect(within(card).queryByRole('button')).toBeNull();
    expect(router.state.location.search).toBe('?aba=anteriores');
  });

  it('opens the tab named in the address', async () => {
    setup({ [PAST]: page([]) }, '/meus-agendamentos?aba=anteriores');

    expect(await screen.findByText('Nenhum agendamento anterior')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Anteriores' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('offers to book when there is nothing upcoming', async () => {
    const { user, router } = setup({ [UPCOMING]: page([]) });

    expect(await screen.findByText('Nenhum agendamento próximo')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Agendar horário' }));

    expect(router.state.location.pathname).toBe('/agendar');
  });

  it('loads more pages on demand', async () => {
    const { user } = setup({
      [UPCOMING]: page([confirmed], { pageSize: 1, total: 2 }),
      'GET /appointments?scope=upcoming&page=2&pageSize=20': page([cancelledLater], {
        page: 2,
        pageSize: 1,
        total: 2,
      }),
    });

    await cardFor('Quarta, 7 de outubro');
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await cardFor('Sexta, 9 de outubro')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the list cannot be loaded', async () => {
    const { user } = setup({
      [UPCOMING]: [() => problemResponse(429, { code: 'RATE_LIMITED' }), page([confirmed])],
    });

    expect(await screen.findByText('Não foi possível carregar seus agendamentos')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await cardFor('Quarta, 7 de outubro')).toBeVisible();
  });
});
