import { afterEach, describe, expect, it, vi } from 'vitest';

import { systemClock } from './clock';

describe('systemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current system time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'));
    expect(systemClock.now().toISOString()).toBe('2026-10-04T12:00:00.000Z');
  });

  it('returns a new Date on every call', () => {
    expect(systemClock.now()).not.toBe(systemClock.now());
  });
});
