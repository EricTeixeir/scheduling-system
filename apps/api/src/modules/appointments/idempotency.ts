import { createHash } from 'node:crypto';

import type { CreateAppointmentOutput } from '@scheduling/shared';

export const IDEMPOTENCY_KEY_TTL_HOURS = 24;

export class IdempotencyKeyTakenError extends Error {
  override readonly name = 'IdempotencyKeyTakenError';

  constructor() {
    super('idempotency key already claimed by another request');
  }
}

export type BookingInput = CreateAppointmentOutput & { readonly clientId?: string };

// Equivalent bodies hash the same: the instant is normalized to UTC and absent notes equal null.
// clientId and durationMinutes enter only when present, so already stored hashes keep matching.
export function requestHashOf({
  startsAt,
  notes,
  clientId,
  durationMinutes,
}: BookingInput): string {
  const canonical = JSON.stringify({
    startsAt: new Date(startsAt).toISOString(),
    notes: notes ?? null,
    ...(clientId === undefined ? {} : { clientId }),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
