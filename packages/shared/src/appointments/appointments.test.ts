import { describe, expect, it } from 'vitest';

import { adminAppointmentSchema, appointmentSchema } from './appointment';
import { appointmentHistorySchema } from './appointment-history';
import {
  adminAppointmentsQuerySchema,
  clientAppointmentsQuerySchema,
  SEARCH_MAX_LENGTH,
} from './appointments-query';
import { createAppointmentSchema } from './create-appointment';
import { updateAppointmentStatusSchema } from './update-appointment-status';

const STARTS_AT = '2026-10-07T14:00:00-03:00';

describe('createAppointmentSchema', () => {
  it('accepts a start time with notes', () => {
    expect(
      createAppointmentSchema.parse({ startsAt: STARTS_AT, notes: 'Primeira consulta' }),
    ).toEqual({ startsAt: STARTS_AT, notes: 'Primeira consulta' });
  });

  it('accepts a start time without notes', () => {
    expect(createAppointmentSchema.parse({ startsAt: STARTS_AT })).toEqual({ startsAt: STARTS_AT });
  });

  it('trims notes', () => {
    expect(createAppointmentSchema.parse({ startsAt: STARTS_AT, notes: '  oi  ' }).notes).toBe(
      'oi',
    );
  });

  it.each(['', '   '])('drops notes that are empty after trimming (%j)', (notes) => {
    const parsed = createAppointmentSchema.parse({ startsAt: STARTS_AT, notes });
    expect(parsed).toEqual({ startsAt: STARTS_AT });
    expect('notes' in parsed).toBe(false);
  });

  it('accepts 500 characters of notes and rejects 501', () => {
    expect(
      createAppointmentSchema.safeParse({ startsAt: STARTS_AT, notes: 'a'.repeat(500) }).success,
    ).toBe(true);
    const tooLong = createAppointmentSchema.safeParse({
      startsAt: STARTS_AT,
      notes: 'a'.repeat(501),
    });
    expect(tooLong.error?.issues[0]?.message).toBe(
      'As observações devem ter no máximo 500 caracteres.',
    );
  });

  it('counts the limit after trimming', () => {
    const padded = `  ${'a'.repeat(500)}  `;
    expect(createAppointmentSchema.safeParse({ startsAt: STARTS_AT, notes: padded }).success).toBe(
      true,
    );
  });

  it.each([
    ['endsAt', '2026-10-07T14:30:00-03:00'],
    ['isAdmin', true],
    ['status', 'COMPLETED'],
  ])('rejects the extra field %s', (key, value) => {
    expect(createAppointmentSchema.safeParse({ startsAt: STARTS_AT, [key]: value }).success).toBe(
      false,
    );
  });

  it('rejects a naive datetime', () => {
    expect(createAppointmentSchema.safeParse({ startsAt: '2026-10-07T14:00:00' }).success).toBe(
      false,
    );
  });

  it.each([null, 123, ['x']])('rejects notes of the wrong type %j', (notes) => {
    expect(createAppointmentSchema.safeParse({ startsAt: STARTS_AT, notes }).success).toBe(false);
  });

  it.each([null, [], 'x'])('rejects the payload %j', (payload) => {
    expect(createAppointmentSchema.safeParse(payload).success).toBe(false);
  });
});

const appointment = {
  id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
  startsAt: '2026-10-07T17:00:00.000Z',
  endsAt: '2026-10-07T17:30:00.000Z',
  status: 'CONFIRMED',
  notes: null,
  createdAt: '2026-10-05T12:00:00.000Z',
};

describe('appointmentSchema', () => {
  it('accepts an appointment with and without notes', () => {
    expect(appointmentSchema.parse(appointment)).toEqual(appointment);
    expect(appointmentSchema.safeParse({ ...appointment, notes: 'oi' }).success).toBe(true);
  });

  it('requires notes to be present, even when null', () => {
    expect(appointmentSchema.safeParse({ ...appointment, notes: undefined }).success).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(appointmentSchema.safeParse({ ...appointment, status: 'PENDING' }).success).toBe(false);
  });

  it('strips unknown keys instead of rejecting them', () => {
    expect(appointmentSchema.parse({ ...appointment, userId: appointment.id })).toEqual(
      appointment,
    );
  });
});

describe('adminAppointmentSchema', () => {
  const client = {
    id: '9b1e4c2a-7d3f-4a8b-9c1d-2e3f4a5b6c7d',
    name: 'Maria',
    email: 'maria@example.com',
  };

  it('accepts an appointment with its client', () => {
    const value = { ...appointment, client };
    expect(adminAppointmentSchema.parse(value)).toEqual(value);
  });

  it('strips extra client fields', () => {
    expect(
      adminAppointmentSchema.parse({ ...appointment, client: { ...client, role: 'CLIENT' } }),
    ).toEqual({ ...appointment, client });
  });

  it('requires the client', () => {
    expect(adminAppointmentSchema.safeParse(appointment).success).toBe(false);
  });
});

describe('updateAppointmentStatusSchema', () => {
  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'])('accepts the target %s', (status) => {
    expect(updateAppointmentStatusSchema.parse({ status })).toEqual({ status });
  });

  it.each(['CONFIRMED', 'cancelled', '', null, 1])('rejects the target %j', (status) => {
    expect(updateAppointmentStatusSchema.safeParse({ status }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      updateAppointmentStatusSchema.safeParse({ status: 'CANCELLED', reason: 'x' }).success,
    ).toBe(false);
  });
});

describe('adminAppointmentsQuerySchema', () => {
  it('applies pagination defaults and leaves filters absent', () => {
    expect(adminAppointmentsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('accepts every filter', () => {
    const query = {
      page: '2',
      pageSize: '10',
      status: 'NO_SHOW',
      from: '2026-10-01',
      to: '2026-10-31',
    };
    expect(adminAppointmentsQuerySchema.parse(query)).toEqual({ ...query, page: 2, pageSize: 10 });
  });

  it('accepts a single-day range', () => {
    expect(
      adminAppointmentsQuerySchema.safeParse({ from: '2026-10-07', to: '2026-10-07' }).success,
    ).toBe(true);
  });

  it('rejects from after to, reporting it on `to`', () => {
    const result = adminAppointmentsQuerySchema.safeParse({ from: '2026-10-08', to: '2026-10-07' });
    expect(result.error?.issues).toMatchObject([
      { path: ['to'], message: 'A data final deve ser igual ou posterior à data inicial.' },
    ]);
  });

  it.each([
    { status: 'PENDING' },
    { from: '2026-02-30' },
    { to: '07/10/2026' },
    { pageSize: '51' },
    { isAdmin: 'true' },
  ])('rejects %j', (query) => {
    expect(adminAppointmentsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('clientAppointmentsQuerySchema', () => {
  it('defaults to upcoming with default pagination', () => {
    expect(clientAppointmentsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      scope: 'upcoming',
    });
  });

  it('accepts the past scope', () => {
    expect(clientAppointmentsQuerySchema.parse({ scope: 'past' }).scope).toBe('past');
  });

  it.each([{ scope: 'all' }, { status: 'CONFIRMED' }, { page: '0' }])('rejects %j', (query) => {
    expect(clientAppointmentsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('adminAppointmentsQuerySchema search (q)', () => {
  it('trims the search text', () => {
    expect(adminAppointmentsQuerySchema.parse({ q: '  Maria  ' })).toEqual({
      page: 1,
      pageSize: 20,
      q: 'Maria',
    });
  });

  it.each(['', '   '])('drops a blank search (%j)', (q) => {
    const parsed = adminAppointmentsQuerySchema.parse({ q });
    expect('q' in parsed).toBe(false);
  });

  it(`accepts ${String(SEARCH_MAX_LENGTH)} characters and rejects one more`, () => {
    expect(
      adminAppointmentsQuerySchema.safeParse({ q: 'a'.repeat(SEARCH_MAX_LENGTH) }).success,
    ).toBe(true);
    const tooLong = adminAppointmentsQuerySchema.safeParse({
      q: 'a'.repeat(SEARCH_MAX_LENGTH + 1),
    });
    expect(tooLong.error?.issues[0]?.message).toBe('A busca deve ter no máximo 100 caracteres.');
  });

  it('counts the limit after trimming', () => {
    const padded = `  ${'a'.repeat(SEARCH_MAX_LENGTH)}  `;
    expect(adminAppointmentsQuerySchema.safeParse({ q: padded }).success).toBe(true);
  });

  it.each([['a', 'b'], 1, null])('rejects a non-text search %j', (q) => {
    expect(adminAppointmentsQuerySchema.safeParse({ q }).success).toBe(false);
  });
});

describe('appointmentHistorySchema', () => {
  const entry = {
    id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
    occurredAt: '2026-10-05T12:00:00.000Z',
    action: 'APPOINTMENT_CREATED',
    fromStatus: null,
    toStatus: 'CONFIRMED',
    actor: { id: '9b1e4c2a-7d3f-4a8b-9c1d-2e3f4a5b6c7d', name: 'Maria', role: 'CLIENT' },
  };

  it('accepts a history and an empty one', () => {
    expect(appointmentHistorySchema.parse({ items: [entry] })).toEqual({ items: [entry] });
    expect(appointmentHistorySchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it('strips unknown keys, including the actor e-mail', () => {
    const extra = { ...entry, metadata: {}, actor: { ...entry.actor, email: 'm@example.com' } };
    expect(appointmentHistorySchema.parse({ items: [extra] })).toEqual({ items: [entry] });
  });

  it.each([
    { action: 'BLOCK_CREATED' },
    { toStatus: 'PENDING' },
    { fromStatus: undefined },
    { actor: { ...entry.actor, role: 'ROOT' } },
    { occurredAt: '2026-10-05 12:00' },
  ])('rejects %j', (override) => {
    expect(appointmentHistorySchema.safeParse({ items: [{ ...entry, ...override }] }).success).toBe(
      false,
    );
  });
});
