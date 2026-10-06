import { createContext, use } from 'react';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const ClockContext = createContext<Clock>(systemClock);

export function useClock(): Clock {
  return use(ClockContext);
}
