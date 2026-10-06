import { render } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';

import { AppProviders } from '@/app/providers';
import { routes as appRoutes } from '@/app/router';
import { ClockContext, systemClock, type Clock } from '@/lib/time/clock';

interface RenderAppOptions {
  readonly path: string;
  readonly fetch: typeof fetch;
  readonly routes?: RouteObject[];
  readonly clock?: Clock;
}

export function fixedClock(isoInstant: string): Clock {
  return { now: () => new Date(isoInstant) };
}

export function renderApp({
  path,
  fetch,
  routes = appRoutes,
  clock = systemClock,
}: RenderAppOptions) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <ClockContext value={clock}>
      <AppProviders router={router} fetch={fetch} />
    </ClockContext>,
  );
  return { ...view, router };
}
