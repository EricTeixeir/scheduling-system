export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  // eslint-disable-next-line no-restricted-syntax -- the single sanctioned read of the system time.
  now: () => new Date(),
};
