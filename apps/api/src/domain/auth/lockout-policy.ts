import { addMinutes, assertValidInstant } from '../time/instant';

export const LOCKOUT_THRESHOLD = 5;

const ESCALATING_LOCK_MINUTES = [1, 5, 15] as const;
const MAX_LOCK_MINUTES = 15;

export function lockMinutesAfter(consecutiveFailures: number): number {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 0) {
    throw new RangeError(
      `consecutiveFailures must be a non-negative integer, got ${String(consecutiveFailures)}`,
    );
  }
  if (consecutiveFailures < LOCKOUT_THRESHOLD) return 0;
  return ESCALATING_LOCK_MINUTES[consecutiveFailures - LOCKOUT_THRESHOLD] ?? MAX_LOCK_MINUTES;
}

export function lockedUntilAfter(consecutiveFailures: number, now: Date): Date | undefined {
  assertValidInstant(now, 'now');
  const minutes = lockMinutesAfter(consecutiveFailures);
  return minutes === 0 ? undefined : addMinutes(now, minutes);
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  assertValidInstant(now, 'now');
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
