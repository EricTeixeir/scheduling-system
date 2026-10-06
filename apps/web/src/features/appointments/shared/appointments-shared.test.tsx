import { APPOINTMENT_STATUSES, type Appointment } from '@scheduling/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarCheck, History } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import type { AppointmentAction } from './appointment-action';
import { AppointmentActions } from './appointment-actions';
import {
  appointmentTimeRange,
  appointmentWeekdayAndTime,
  appointmentWhen,
  hasStarted,
} from './appointment-format';
import { AppointmentStatusBadge } from './appointment-status-badge';
import { STATUS_TONE_CLASSES, statusPresentationOf } from './status-presentation';

const SAO_PAULO = 'America/Sao_Paulo';

const appointment: Appointment = {
  id: '5b1e6a4c-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
  startsAt: '2026-10-07T13:00:00.000Z',
  endsAt: '2026-10-07T13:30:00.000Z',
  status: 'CONFIRMED',
  notes: null,
  createdAt: '2026-10-01T12:00:00.000Z',
};

describe('status presentation', () => {
  it.each(APPOINTMENT_STATUSES)('describes %s with a label, an icon and a known tone', (status) => {
    const presentation = statusPresentationOf(status);

    expect(presentation.label.length).toBeGreaterThan(0);
    expect(presentation.icon).toBeDefined();
    expect(Object.keys(STATUS_TONE_CLASSES)).toContain(presentation.tone);
  });

  it('gives each status its own label', () => {
    const labels = APPOINTMENT_STATUSES.map((status) => statusPresentationOf(status).label);
    expect(new Set(labels).size).toBe(APPOINTMENT_STATUSES.length);
  });

  it('renders the badge with the status label', () => {
    render(<AppointmentStatusBadge status="NO_SHOW" />);

    expect(screen.getByText('Não compareceu')).toBeInTheDocument();
  });
});

describe('appointment formatting', () => {
  it('describes when the appointment happens in the business zone', () => {
    expect(appointmentWhen(appointment, SAO_PAULO)).toBe('Quarta, 7 de outubro · 10:00 – 10:30');
    expect(appointmentTimeRange(appointment, SAO_PAULO)).toBe('10:00 – 10:30');
    expect(appointmentWeekdayAndTime(appointment, SAO_PAULO)).toBe('quarta às 10:00');
  });

  it('treats the start instant itself as started', () => {
    expect(hasStarted(appointment, new Date('2026-10-07T12:59:59.999Z'))).toBe(false);
    expect(hasStarted(appointment, new Date('2026-10-07T13:00:00.000Z'))).toBe(true);
  });
});

describe('AppointmentActions', () => {
  const now = new Date('2026-10-07T09:00:00.000Z');

  function action(overrides: Partial<AppointmentAction>): AppointmentAction {
    return {
      id: 'history',
      label: 'Ver histórico',
      icon: History,
      variant: 'ghost',
      isAvailable: () => true,
      run: vi.fn(() => Promise.resolve('done' as const)),
      ...overrides,
    };
  }

  it('renders only the actions available for the appointment', () => {
    render(
      <AppointmentActions
        appointment={appointment}
        now={now}
        actions={[
          action({ id: 'a', label: 'Disponível' }),
          action({ id: 'b', label: 'Indisponível', isAvailable: () => false }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Disponível' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Indisponível' })).not.toBeInTheDocument();
  });

  it('renders nothing when no action is available', () => {
    const { container } = render(
      <AppointmentActions
        appointment={appointment}
        now={now}
        actions={[action({ isAvailable: () => false })]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('runs an action without confirmation right away', async () => {
    const user = userEvent.setup();
    const run = vi.fn(() => Promise.resolve('done' as const));
    render(<AppointmentActions appointment={appointment} now={now} actions={[action({ run })]} />);

    await user.click(screen.getByRole('button', { name: 'Ver histórico' }));

    expect(run).toHaveBeenCalledWith(appointment);
  });

  it('asks for confirmation first and does nothing when dismissed', async () => {
    const user = userEvent.setup();
    const run = vi.fn(() => Promise.resolve('done' as const));
    render(
      <AppointmentActions
        appointment={appointment}
        now={now}
        actions={[
          action({
            id: 'complete',
            label: 'Concluir',
            icon: CalendarCheck,
            run,
            confirmation: {
              title: () => 'Concluir o atendimento?',
              description: () => 'Detalhes',
              confirmLabel: 'Concluir atendimento',
              pendingLabel: 'Concluindo…',
              dismissLabel: 'Voltar',
              tone: 'default',
            },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(await screen.findByRole('dialog', { name: 'Concluir o atendimento?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    await user.click(await screen.findByRole('button', { name: 'Concluir atendimento' }));
    expect(run).toHaveBeenCalledOnce();
  });
});
