/** Source of the current instant. Domain code receives "now" as a parameter; services get it from a Clock. */
export interface Clock {
  now(): Date;
}

/** The real clock. The only place in the domain allowed to read the system time. */
export const systemClock: Clock = {
  // eslint-disable-next-line no-restricted-syntax -- the single sanctioned read of the system time.
  now: () => new Date(),
};
