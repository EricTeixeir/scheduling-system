import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { appointmentStatusChangedEvent, type AuditContext } from './appointment-audit';

const CONTEXT: AuditContext = {
  actor: { id: randomUUID(), role: 'ADMIN' },
  requestId: 'request-1',
  now: new Date('2026-10-05T12:00:00.000Z'),
};

describe('appointmentStatusChangedEvent', () => {
  it.each([
    ['CANCELLED', 'APPOINTMENT_CANCELLED'],
    ['COMPLETED', 'APPOINTMENT_COMPLETED'],
    ['NO_SHOW', 'APPOINTMENT_NO_SHOW'],
  ] as const)('names a change to %s %s', (status, action) => {
    const id = randomUUID();
    expect(
      appointmentStatusChangedEvent(CONTEXT, { status: 'CONFIRMED' }, { id, status }),
    ).toMatchObject({ action, entityId: id, fromStatus: 'CONFIRMED', toStatus: status });
  });

  it('refuses a change to CONFIRMED, which no transition produces', () => {
    expect(() =>
      appointmentStatusChangedEvent(
        CONTEXT,
        { status: 'CONFIRMED' },
        { id: randomUUID(), status: 'CONFIRMED' },
      ),
    ).toThrow('no audit action for a change to CONFIRMED');
  });
});
