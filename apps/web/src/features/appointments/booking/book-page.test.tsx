import type { Appointment, Slot } from '@scheduling/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { consecutiveDays, weekdayOf, type LocalDate } from '@/lib/time/local-date';
import { CLIENT_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { fixedClock, renderApp } from '@/test/render-app';

const TIME_ZONE = 'America/Sao_Paulo';
const TODAY = '2026-10-07';
const NOW = fixedClock('2026-10-07T12:00:00.000Z');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Handler = () => Response | Promise<Response>;

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

const DEFAULT_TIMES = ['10:00', '14:00', '19:00'];

function twoWeeksOfAvailability(overrides: Record<string, Handler | Handler[]> = {}) {
  const routes: Record<string, Handler | Handler[]> = {};
  for (const date of consecutiveDays(TODAY, 14)) {
    const isSunday = weekdayOf(date) === 0;
    routes[`GET /availability?date=${date}`] = availability(date, isSunday ? [] : DEFAULT_TIMES);
  }
  return { ...routes, ...overrides };
}

function bookedAppointment(slot: Slot, notes: string | null = null): Appointment {
  return {
    id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
    ...slot,
    status: 'CONFIRMED',
    notes,
    createdAt: '2026-10-07T12:00:00.000Z',
  };
}

function setup(routes: Record<string, Handler | Handler[]>) {
  const user = userEvent.setup();
  const mock = createFetchMock({ 'GET /auth/me': () => jsonResponse(CLIENT_USER), ...routes });
  const view = renderApp({ path: '/agendar', fetch: mock.fetch, clock: NOW });
  return { user, ...mock, ...view };
}

async function openSlot(user: ReturnType<typeof userEvent.setup>, time: string) {
  await user.click(await screen.findByRole('button', { name: time }));
  return screen.findByRole('dialog', { name: 'Confirmar agendamento' });
}

describe('BookPage', () => {
  it('shows the selected day with its slots grouped by period', async () => {
    setup(twoWeeksOfAvailability());

    expect(await screen.findByRole('heading', { name: 'Quarta, 7 de outubro' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: /Manhã/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /Tarde/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: /Noite/ })).toBeVisible();
    expect(screen.getByRole('button', { name: '10:00' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Outubro de 2026' })).toBeVisible();
  });

  it('disables closed days and the previous week from today', async () => {
    setup(twoWeeksOfAvailability());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Domingo, 11 de outubro/ })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Quarta, 7 de outubro, hoje/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('moves to another day and to the next week', async () => {
    const { user } = setup(twoWeeksOfAvailability());

    await user.click(await screen.findByRole('button', { name: /^Sexta, 9 de outubro/ }));
    expect(await screen.findByRole('heading', { name: 'Sexta, 9 de outubro' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByRole('heading', { name: 'Quarta, 14 de outubro' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeEnabled();
  });

  it('offers the next day when the selected day has no slots', async () => {
    const { user } = setup(
      twoWeeksOfAvailability({ [`GET /availability?date=${TODAY}`]: availability(TODAY, []) }),
    );

    expect(await screen.findByText('Sem horários neste dia')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ver próximo dia' }));

    expect(await screen.findByRole('heading', { name: 'Quinta, 8 de outubro' })).toBeVisible();
    expect(await screen.findByRole('button', { name: '14:00' })).toBeVisible();
  });

  it('shows an error with a retry when the slots cannot be loaded', async () => {
    const { user } = setup(
      twoWeeksOfAvailability({
        [`GET /availability?date=${TODAY}`]: [
          () => problemResponse(429, { code: 'RATE_LIMITED' }),
          availability(TODAY, DEFAULT_TIMES),
        ],
      }),
    );

    expect(await screen.findByText('Não foi possível carregar os horários')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('button', { name: '10:00' })).toBeVisible();
  });

  it('books a slot with notes and an idempotency key, then links to my appointments', async () => {
    const slot = slotOn(TODAY, '10:00');
    const { user, callsTo, router } = setup(
      twoWeeksOfAvailability({
        'POST /appointments': () => jsonResponse(bookedAppointment(slot, 'Primeira vez'), 201),
        'GET /appointments?scope=upcoming&page=1&pageSize=20': () =>
          jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }),
      }),
    );

    const dialog = await openSlot(user, '10:00');
    expect(within(dialog).getByText('Quarta, 7 de outubro')).toBeVisible();
    expect(within(dialog).getByText('10:00 – 10:30')).toBeVisible();
    await user.type(within(dialog).getByLabelText('Observações (opcional)'), 'Primeira vez');
    expect(within(dialog).getByText('12/500 caracteres')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText('Agendamento confirmado')).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const [booking] = callsTo('POST', '/appointments');
    expect(booking?.body).toEqual({ startsAt: slot.startsAt, notes: 'Primeira vez' });
    expect(booking?.headers.get('Idempotency-Key')).toMatch(UUID_PATTERN);
    await waitFor(() => {
      expect(callsTo('GET', `/availability?date=${TODAY}`).length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ver meus agendamentos' }));
    expect(router.state.location.pathname).toBe('/meus-agendamentos');
  });

  it('closes and refreshes the slots when the slot was just taken (409 SLOT_TAKEN)', async () => {
    const { user, callsTo } = setup(
      twoWeeksOfAvailability({
        [`GET /availability?date=${TODAY}`]: [
          availability(TODAY, DEFAULT_TIMES),
          availability(TODAY, ['14:00', '19:00']),
        ],
        'POST /appointments': () => problemResponse(409, { code: 'SLOT_TAKEN' }),
      }),
    );

    const dialog = await openSlot(user, '10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText(/Este horário acabou de ser reservado/)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
    });
    expect(callsTo('GET', `/availability?date=${TODAY}`)).toHaveLength(2);
  });

  it('keeps the confirmation open after a network failure and retries with the same key', async () => {
    const slot = slotOn(TODAY, '10:00');
    const { user, callsTo } = setup(
      twoWeeksOfAvailability({
        'POST /appointments': [
          () => Promise.reject(new TypeError('Failed to fetch')),
          () => jsonResponse(bookedAppointment(slot), 201),
        ],
      }),
    );

    const dialog = await openSlot(user, '10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText('Agendamento confirmado')).toBeVisible();
    const keys = callsTo('POST', '/appointments').map((call) =>
      call.headers.get('Idempotency-Key'),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('dismisses the confirmation without booking', async () => {
    const { user, callsTo } = setup(twoWeeksOfAvailability());

    const dialog = await openSlot(user, '19:00');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(callsTo('POST', '/appointments')).toHaveLength(0);
  });
});
