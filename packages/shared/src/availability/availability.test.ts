import { describe, expect, it } from 'vitest';

import { availabilityQuerySchema } from './availability-query';
import { availabilityResponseSchema, slotSchema } from './availability-response';

describe('availabilityQuerySchema', () => {
  it('accepts a calendar date', () => {
    expect(availabilityQuerySchema.parse({ date: '2026-10-07' })).toEqual({ date: '2026-10-07' });
  });

  it.each(['2026-02-30', '2026-10-07T00:00:00Z', 20261007, null])('rejects the date %j', (date) => {
    expect(availabilityQuerySchema.safeParse({ date }).success).toBe(false);
  });

  it('rejects a missing date and unknown keys', () => {
    expect(availabilityQuerySchema.safeParse({}).success).toBe(false);
    expect(availabilityQuerySchema.safeParse({ date: '2026-10-07', isAdmin: '1' }).success).toBe(
      false,
    );
  });
});

describe('availabilityResponseSchema', () => {
  const slot = { startsAt: '2026-10-07T12:00:00.000Z', endsAt: '2026-10-07T12:30:00.000Z' };
  const response = { date: '2026-10-07', timeZone: 'America/Sao_Paulo', slots: [slot] };

  it('accepts a response with slots', () => {
    expect(availabilityResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts a day without slots', () => {
    expect(availabilityResponseSchema.safeParse({ ...response, slots: [] }).success).toBe(true);
  });

  it('rejects a slot with a naive datetime', () => {
    expect(slotSchema.safeParse({ ...slot, endsAt: '2026-10-07T12:30:00' }).success).toBe(false);
  });

  it('strips unknown keys at any level', () => {
    expect(availabilityResponseSchema.parse({ ...response, extra: 1 })).toEqual(response);
    expect(slotSchema.parse({ ...slot, available: true })).toEqual(slot);
  });

  it('rejects slots that are not an array', () => {
    expect(availabilityResponseSchema.safeParse({ ...response, slots: slot }).success).toBe(false);
  });
});
