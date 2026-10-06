import { SEEDED_ADMIN, SEEDED_CLIENT } from './config';
import type { ApiClient } from './http';
import { RulesSession } from './session';

export interface RulesActors {
  readonly session: RulesSession;
  /** Freshly registered, so its 10-per-minute booking budget is untouched for the race. */
  readonly racer: ApiClient;
  readonly client: ApiClient;
  readonly seededClient: ApiClient;
  readonly admin: ApiClient;
}

export async function prepareActors(): Promise<RulesActors> {
  const session = new RulesSession();
  return {
    session,
    racer: await session.registerClient('racer'),
    client: await session.registerClient('client'),
    seededClient: await session.login(SEEDED_CLIENT),
    admin: await session.login(SEEDED_ADMIN),
  };
}
