import type { AdminAppointment, ClientSummary, Slot } from '@scheduling/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { consecutiveDays, type LocalDate } from '@/lib/time/local-date';
import { ADMIN_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const TIME_ZONE = 'America/Sao_Paulo';
const TODAY = '2026-10-07';
const NOW = fixedClock('2026-10-07T12:00:00.000Z');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUMMARY = 'GET /admin/appointments/summary';
const BOOK = 'POST /admin/appointments';
const SEARCH = 'GET /admin/clients?q=mar';
const CONFIRMED_TODAY = `GET /admin/appointments?page=1&pageSize=50&status=CONFIRMED&from=${TODAY}&to=${TODAY}`;

type Handler = () => Response | Promise<Response>;

const maria: ClientSummary = {
  id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  name: 'Maria Silva',
  email: 'maria@example.com',
};
const mariana: ClientSummary = {
  id: '4a3c9d2f-0b5e-4f8c-9d3b-2e6f7a8b9c0d',
  name: 'Mariana Souza',
  email: 'mariana@example.com',
};

function slotOn(date: LocalDate, time: string): Slot {
  const startsAt = new Date(`${date}T${time}:00-03:00`);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
  };
}

function availability(date: LocalDate, times: readonly string[]): Handler {
  return () =>
    jsonResponse({ date, timeZone: TIME_ZONE, slots: times.map((time) => slotOn(date, time)) });
}

function summary(todayConfirmed: number): Handler {
  return () =>
    jsonResponse({
      todayConfirmed,
      next7DaysConfirmed: todayConfirmed,
      completedLast30Days: 0,
      noShowLast30Days: 0,
      cancelledLast30Days: 0,
    });
}

function booked(client: ClientSummary, slot: Slot): AdminAppointment {
  return {
    id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
    ...slot,
    status: 'CONFIRMED',
    notes: null,
    createdAt: '2026-10-07T12:00:00.000Z',
    client,
  };
}

function confirmedPage(items: readonly AdminAppointment[]): Handler {
  return () => jsonResponse({ items, page: 1, pageSize: 50, total: items.length });
}

function setup(routes: Record<string, Handler | Handler[]>) {
  const user = userEvent.setup();
  const week: Record<string, Handler> = {};
  for (const date of consecutiveDays(TODAY, 7)) {
    week[`GET /availability?date=${date}`] = availability(date, ['10:00', '14:00']);
  }
  const mock = createFetchMock({
    'GET /auth/me': () => jsonResponse(ADMIN_USER),
    [SUMMARY]: summary(0),
    [SEARCH]: () => jsonResponse({ items: [maria, mariana] }),
    [CONFIRMED_TODAY]: confirmedPage([]),
    ...week,
    ...routes,
  });
  const view = renderApp({ path: '/admin?visao=disponiveis', fetch: mock.fetch, clock: NOW });
  return { user, ...mock, ...view };
}

async function openSlot(user: ReturnType<typeof userEvent.setup>, time: string) {
  await user.click(await screen.findByRole('button', { name: time }));
  return screen.findByRole('dialog', { name: 'Agendar para cliente' });
}

async function pickSecondClient(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  const combobox = within(dialog).getByRole('combobox', { name: 'Cliente' });
  await user.type(combobox, 'mar');
  expect(await within(dialog).findByRole('option', { name: /Mariana Souza/ })).toBeVisible();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(combobox).toHaveValue('Mariana Souza');
  expect(within(dialog).getByText('mariana@example.com')).toBeVisible();
}

describe('admin booking for a client', () => {
  it('books a free slot for the chosen client and refreshes the screen', async () => {
    const slot = slotOn(TODAY, '14:00');
    const { user, callsTo, router } = setup({
      [BOOK]: () => jsonResponse(booked(mariana, slot), 201),
    });

    const dialog = await openSlot(user, '14:00');
    expect(within(dialog).getByText('14:00 – 14:30')).toBeVisible();
    await pickSecondClient(user, dialog);
    await user.type(within(dialog).getByLabelText('Observações (opcional)'), 'Retorno');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText('Agendado para Mariana Souza')).toBeVisible();
    const [booking] = callsTo('POST', '/admin/appointments');
    expect(booking?.body).toEqual({
      clientId: mariana.id,
      startsAt: slot.startsAt,
      notes: 'Retorno',
    });
    expect(booking?.headers.get('Idempotency-Key')).toMatch(UUID_PATTERN);
    await waitFor(() => {
      expect(callsTo('GET', `/availability?date=${TODAY}`).length).toBeGreaterThan(1);
    });
    expect(callsTo('GET', '/admin/appointments/summary').length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: 'Ver agendados' }));
    expect(router.state.location.search).toBe('?visao=agendados');
  });

  it('sends the chosen duration when booking several slots for a client', async () => {
    const slot = slotOn(TODAY, '10:00');
    const { user, callsTo } = setup({
      [`GET /availability?date=${TODAY}`]: availability(TODAY, ['10:00', '10:30', '14:00']),
      [BOOK]: () =>
        jsonResponse(booked(mariana, { ...slot, endsAt: slotOn(TODAY, '11:00').startsAt }), 201),
    });

    const dialog = await openSlot(user, '10:00');
    await pickSecondClient(user, dialog);
    within(dialog).getByRole('slider', { name: 'Duração' }).focus();
    await user.keyboard('{End}');
    expect(within(dialog).getByText('10:00 – 11:00 · 1h')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText('Agendado para Mariana Souza')).toBeVisible();
    const [booking] = callsTo('POST', '/admin/appointments');
    expect(booking?.body).toEqual({
      clientId: mariana.id,
      startsAt: slot.startsAt,
      durationMinutes: 60,
    });
  });

  it('asks for a client before booking', async () => {
    const { user, callsTo } = setup({});

    const dialog = await openSlot(user, '10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await within(dialog).findByText('Escolha um cliente da lista.')).toBeVisible();
    expect(callsTo('POST', '/admin/appointments')).toHaveLength(0);
  });

  it('says when no client matches the search', async () => {
    const { user } = setup({ [SEARCH]: () => jsonResponse({ items: [] }) });

    const dialog = await openSlot(user, '10:00');
    await user.type(within(dialog).getByRole('combobox', { name: 'Cliente' }), 'mar');

    expect(await within(dialog).findByText('Nenhum cliente encontrado.')).toBeVisible();
  });

  it('closes and refreshes the slots when the slot was just taken (409 SLOT_TAKEN)', async () => {
    const { user, callsTo } = setup({
      [`GET /availability?date=${TODAY}`]: [
        availability(TODAY, ['10:00', '14:00']),
        availability(TODAY, ['10:00']),
      ],
      [BOOK]: () => problemResponse(409, { code: 'SLOT_TAKEN' }),
    });

    const dialog = await openSlot(user, '14:00');
    await pickSecondClient(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText(/Este horário acabou de ser reservado/)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '14:00' })).not.toBeInTheDocument();
    });
    expect(callsTo('GET', `/availability?date=${TODAY}`)).toHaveLength(2);
  });
});

describe('admin grid of the day', () => {
  it('shows the confirmed appointments of any client and opens their history', async () => {
    const appointment = booked(maria, slotOn(TODAY, '11:00'));
    const { user } = setup({
      [CONFIRMED_TODAY]: confirmedPage([appointment]),
      [`GET /admin/appointments/${appointment.id}/history`]: () => jsonResponse({ items: [] }),
    });

    const cell = await screen.findByRole('button', {
      name: '11:00, agendado por Maria Silva. Ver histórico',
    });
    expect(within(cell).getByText('Maria')).toBeVisible();
    expect(screen.getByText('Horários agendados')).toBeVisible();
    const times = screen.getAllByRole('button', { name: /^\d{2}:\d{2}/ });
    expect(times.map((button) => button.textContent)).toEqual(['10:00', '11:00Maria', '14:00']);

    await user.click(cell);

    const sheet = await screen.findByRole('dialog', { name: 'Histórico' });
    expect(within(sheet).getByText(/Maria Silva/)).toBeVisible();
    expect(await within(sheet).findByText('Nenhum evento registrado')).toBeVisible();
  });
});
