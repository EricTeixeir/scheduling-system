import type { Clock } from '../domain/time/clock';

export interface FakeClock extends Clock {
  set(instant: Date | string): void;
  advanceMinutes(minutes: number): void;
  advanceSeconds(seconds: number): void;
}

export function createFakeClock(start: Date | string = '2026-10-05T12:00:00.000Z'): FakeClock {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set(instant) {
      current = new Date(instant);
    },
    advanceMinutes(minutes) {
      current = new Date(current.getTime() + minutes * 60_000);
    },
    advanceSeconds(seconds) {
      current = new Date(current.getTime() + seconds * 1000);
    },
  };
}
