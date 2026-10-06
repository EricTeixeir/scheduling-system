import type { ScheduleBlock } from '@scheduling/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ADMIN_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const NOW = fixedClock('2026-10-07T15:00:00.000Z');

type Handler = () => Response | Promise<Response>;

const lunch: ScheduleBlock = {
  id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  weekdays: [1, 2, 3, 4, 5],
  startTime: '12:00',
  endTime: '13:00',
  startsOn: '2026-10-05',
  endsOn: null,
  reason: 'Almoço',
  createdAt: '2026-10-05T12:00:00.000Z',
};

function setup(routes: Record<string, Handler | Handler[]>) {
  const user = userEvent.setup();
  const mock = createFetchMock({ 'GET /auth/me': () => jsonResponse(ADMIN_USER), ...routes });
  const view = renderApp({ path: '/admin/bloqueios', fetch: mock.fetch, clock: NOW });
  return { user, ...mock, ...view };
}

function pressedWeekdays(): string[] {
  return screen
    .getAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label') ?? '');
}

describe('ScheduleBlocksPage', () => {
  it('lists blocks with time, weekdays, validity and reason', async () => {
    setup({
      'GET /admin/blocks': () =>
        jsonResponse({
          items: [
            lunch,
            {
              ...lunch,
              id: '9b2c8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
              weekdays: [6],
              startTime: '08:00',
              endTime: '09:00',
              endsOn: '2026-12-19',
              reason: null,
            },
          ],
        }),
    });

    const lunchCard = (await screen.findByRole('heading', { name: '12:00 – 13:00' })).closest(
      'article',
    );
    if (lunchCard === null) throw new Error('No card for the lunch block');
    expect(within(lunchCard).getByText('Seg')).toBeVisible();
    expect(within(lunchCard).getByText('Sex')).toBeVisible();
    expect(within(lunchCard).getByText('A partir de 05/10 · Sem data de término')).toBeVisible();
    expect(within(lunchCard).getByText('Almoço')).toBeVisible();
    expect(screen.getByText('A partir de 05/10 até 19/12')).toBeVisible();
  });

  it('picks weekdays with the shortcuts and lists the appointments a new block would hit', async () => {
    const { user, callsTo } = setup({
      'GET /admin/blocks': () => jsonResponse({ items: [] }),
      'POST /admin/blocks': () =>
        problemResponse(409, {
          code: 'BLOCK_CONFLICT',
          conflicts: [
            {
              appointmentId: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
              startsAt: '2026-10-10T15:00:00.000Z',
              endsAt: '2026-10-10T15:30:00.000Z',
              clientName: 'Maria Silva',
            },
          ],
        }),
    });

    await user.click(await screen.findByRole('button', { name: 'Novo bloqueio' }));
    expect(pressedWeekdays()).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']);
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(pressedWeekdays()).toHaveLength(7);
    await user.click(screen.getByRole('button', { name: 'Domingo' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sem data de término' }));
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('O bloqueio coincide com agendamentos confirmados'),
    ).toBeVisible();
    expect(within(alert).getByText('Sábado, 10 de outubro às 12:00 · Maria Silva')).toBeVisible();
    expect(within(alert).getByRole('link', { name: 'Ir para agendamentos' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(callsTo('POST', '/admin/blocks')[0]?.body).toEqual({
      weekdays: [1, 2, 3, 4, 5, 6],
      startTime: '12:00',
      endTime: '13:00',
      startsOn: '2026-10-07',
    });
  });

  it('asks for an end date unless "Sem data de término" is checked', async () => {
    const { user, callsTo } = setup({ 'GET /admin/blocks': () => jsonResponse({ items: [] }) });

    await user.click(await screen.findByRole('button', { name: 'Novo bloqueio' }));
    await user.click(screen.getByRole('button', { name: 'Criar bloqueio' }));

    expect(
      await screen.findByText('Informe a data final ou marque "Sem data de término".'),
    ).toBeVisible();
    expect(callsTo('POST', '/admin/blocks')).toHaveLength(0);
  });
});
