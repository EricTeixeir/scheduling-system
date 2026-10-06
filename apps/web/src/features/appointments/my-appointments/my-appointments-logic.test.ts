import type { Appointment, AppointmentStatus } from '@scheduling/shared';
import { describe, expect, it, vi } from 'vitest';

import { cancelAction, isCancellableByClient } from './client-appointment-actions';
import { nextPageOf } from './my-appointments-api';

const now = new Date('2026-10-07T12:00:00.000Z');

function appointmentAt(startsAt: string, status: AppointmentStatus = 'CONFIRMED'): Appointment {
  return {
    id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    status,
    notes: null,
    createdAt: '2026-10-01T12:00:00.000Z',
  };
}

describe('isCancellableByClient', () => {
  it('allows a future confirmed appointment, even inside the server-side deadline', () => {
    expect(isCancellableByClient(appointmentAt('2026-10-07T12:10:00.000Z'), now)).toBe(true);
  });

  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)('refuses a %s appointment', (status) => {
    expect(isCancellableByClient(appointmentAt('2026-10-08T12:00:00.000Z', status), now)).toBe(
      false,
    );
  });

  it('refuses an appointment that already started', () => {
    expect(isCancellableByClient(appointmentAt('2026-10-07T12:00:00.000Z'), now)).toBe(false);
  });
});

describe('cancelAction', () => {
  it('asks "Cancelar o agendamento de quarta às 10:00?"', () => {
    const action = cancelAction(vi.fn());

    expect(action.confirmation?.title(appointmentAt('2026-10-07T13:00:00.000Z'))).toBe(
      'Cancelar o agendamento de quarta às 10:00?',
    );
    expect(action.confirmation?.description(appointmentAt('2026-10-07T13:00:00.000Z'))).toMatch(
      /^Quarta, 7 de outubro · 10:00 – 10:30\./,
    );
  });
});

describe('nextPageOf', () => {
  it.each([
    [{ page: 1, pageSize: 20, total: 21 }, 2],
    [{ page: 2, pageSize: 20, total: 40 }, undefined],
    [{ page: 1, pageSize: 20, total: 0 }, undefined],
  ])('pages %j to %j', (page, expected) => {
    expect(nextPageOf({ ...page, items: [] })).toBe(expected);
  });
});
