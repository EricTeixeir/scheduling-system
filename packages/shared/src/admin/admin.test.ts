import { describe, expect, it } from 'vitest';

import { adminCreateAppointmentSchema } from './admin-booking';
import { adminSummarySchema } from './admin-summary';
import { clientSearchQuerySchema } from './clients';

const CLIENT_ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const STARTS_AT = '2026-10-08T13:00:00.000Z';

describe('adminCreateAppointmentSchema', () => {
  it('keeps trimmed notes and drops blank ones', () => {
    expect(
      adminCreateAppointmentSchema.parse({
        clientId: CLIENT_ID,
        startsAt: STARTS_AT,
        notes: ' x ',
      }),
    ).toEqual({ clientId: CLIENT_ID, startsAt: STARTS_AT, notes: 'x' });
    expect(
      adminCreateAppointmentSchema.parse({ clientId: CLIENT_ID, startsAt: STARTS_AT, notes: ' ' }),
    ).toEqual({ clientId: CLIENT_ID, startsAt: STARTS_AT });
  });

  it('keeps a duration and refuses one over the maximum', () => {
    const base = { clientId: CLIENT_ID, startsAt: STARTS_AT };
    expect(adminCreateAppointmentSchema.parse({ ...base, durationMinutes: 60 })).toEqual({
      ...base,
      durationMinutes: 60,
    });
    expect(adminCreateAppointmentSchema.safeParse({ ...base, durationMinutes: 181 }).success).toBe(
      false,
    );
  });

  it('rejects a missing client, a bad id and extra fields', () => {
    expect(adminCreateAppointmentSchema.safeParse({ startsAt: STARTS_AT }).success).toBe(false);
    expect(
      adminCreateAppointmentSchema.safeParse({ clientId: 'x', startsAt: STARTS_AT }).success,
    ).toBe(false);
    expect(
      adminCreateAppointmentSchema.safeParse({
        clientId: CLIENT_ID,
        startsAt: STARTS_AT,
        userId: CLIENT_ID,
      }).success,
    ).toBe(false);
  });
});

describe('clientSearchQuerySchema', () => {
  it('trims the search and refuses a blank one', () => {
    expect(clientSearchQuerySchema.parse({ q: ' maria ' })).toEqual({ q: 'maria' });
    expect(clientSearchQuerySchema.safeParse({ q: '  ' }).success).toBe(false);
  });
});

describe('adminSummarySchema', () => {
  it('accepts non-negative whole counts only', () => {
    const summary = {
      todayConfirmed: 2,
      next7DaysConfirmed: 5,
      completedLast30Days: 10,
      noShowLast30Days: 1,
      cancelledLast30Days: 3,
    };
    expect(adminSummarySchema.parse(summary)).toEqual(summary);
    expect(adminSummarySchema.safeParse({ ...summary, todayConfirmed: -1 }).success).toBe(false);
  });
});
