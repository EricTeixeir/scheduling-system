import { render } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';

import { AppProviders } from '@/app/providers';
import { routes as appRoutes } from '@/app/router';

interface RenderAppOptions {
  readonly path: string;
  readonly fetch: typeof fetch;
  readonly routes?: RouteObject[];
}

export function renderApp({ path, fetch, routes = appRoutes }: RenderAppOptions) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<AppProviders router={router} fetch={fetch} />);
  return { ...view, router };
}
