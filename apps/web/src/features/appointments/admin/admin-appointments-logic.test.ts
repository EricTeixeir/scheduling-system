import type { AdminAppointment, AppointmentStatus } from '@scheduling/shared';
import { describe, expect, it, vi } from 'vitest';

import { availableActions } from '../shared/appointment-action';
import { adminAppointmentActions } from './admin-appointment-actions';
import { periodRange } from './admin-appointment-period';

const START = '2026-10-07T13:00:00.000Z';
const BEFORE_START = new Date('2026-10-07T12:59:00.000Z');
const AT_START = new Date(START);

function appointment(status: AppointmentStatus): AdminAppointment {
  return {
    id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
    startsAt: START,
    endsAt: '2026-10-07T13:30:00.000Z',
    status,
    notes: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    client: {
      id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
      name: 'Maria Silva',
      email: 'maria@example.com',
    },
  };
}

const actions = adminAppointmentActions({ changeStatus: vi.fn(), showHistory: vi.fn() });

function availableIds(status: AppointmentStatus, now: Date): string[] {
  return availableActions(actions, appointment(status), now).map((action) => action.id);
}

describe('admin appointment actions', () => {
  it('offers cancel and history before the start', () => {
    expect(availableIds('CONFIRMED', BEFORE_START)).toEqual(['cancel', 'history']);
  });

  it('offers complete and no-show instead of cancel once the appointment has started', () => {
    expect(availableIds('CONFIRMED', AT_START)).toEqual(['complete', 'no-show', 'history']);
  });

  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)('only shows history for %s', (status) => {
    expect(availableIds(status, AT_START)).toEqual(['history']);
  });

  it('confirms the cancellation naming the client and the time', () => {
    const cancel = actions.find((action) => action.id === 'cancel');

    expect(cancel?.confirmation?.title(appointment('CONFIRMED'))).toBe(
      'Cancelar o agendamento de Maria Silva?',
    );
    expect(cancel?.confirmation?.description(appointment('CONFIRMED'))).toMatch(
      /^Quarta, 7 de outubro · 10:00 – 10:30\./,
    );
  });
});

describe('periodRange', () => {
  it.each([
    ['from-today', { from: '2026-10-07' }],
    ['today', { from: '2026-10-07', to: '2026-10-07' }],
    ['week', { from: '2026-10-07', to: '2026-10-13' }],
    ['all', {}],
  ] as const)('maps %s to %j', (period, range) => {
    expect(periodRange(period, '2026-10-07')).toEqual(range);
  });
});
