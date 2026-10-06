import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/app/shell/app-shell';
import { RequireAuth } from '@/features/auth/route-guards';
import { logger } from '@/lib/logger';
import { CLIENT_USER, createFetchMock, jsonResponse } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';
import { createTestLogger } from '@/test/test-logger';

import { AppErrorBoundary } from './app-error-boundary';
import { RouterErrorFallback } from './router-error-fallback';

function AlwaysThrows(): never {
  throw new Error('render failed');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('renders the fallback when a child throws and logs the error', () => {
    const testLogger = createTestLogger();

    render(
      <AppErrorBoundary scope="test" logger={testLogger}>
        <AlwaysThrows />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    const [message, context] = testLogger.error.mock.calls[0] ?? [];
    expect(message).toBe('Render error');
    expect(context?.scope).toBe('test');
    expect(context?.error).toEqual(new Error('render failed'));
    expect(typeof context?.componentStack).toBe('string');
  });

  it('remounts the children when "Tentar novamente" is clicked', async () => {
    const user = userEvent.setup();
    let failing = true;
    const mounted = vi.fn();
    function FailsUntilFixed() {
      useEffect(mounted, []);
      if (failing) throw new Error('temporarily broken');
      return <p>Conteúdo carregado</p>;
    }

    render(
      <AppErrorBoundary scope="test" logger={createTestLogger()}>
        <FailsUntilFixed />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(screen.getByText('Conteúdo carregado')).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('isolates a broken page: the header and navigation stay on screen', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const { fetch } = createFetchMock({ 'GET /auth/me': () => jsonResponse(CLIENT_USER) });

    renderApp({
      path: '/quebrada',
      fetch,
      routes: [
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [{ path: '/quebrada', element: <AlwaysThrows /> }],
            },
          ],
        },
      ],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Meus agendamentos/ })).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      'Render error',
      expect.objectContaining({ scope: 'page' }),
    );
  });
});

describe('RouterErrorFallback', () => {
  it('shows a friendly page and logs errors the router catches', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          throw new Error('loader failed');
        },
        element: <p>nunca</p>,
        errorElement: <RouterErrorFallback />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado');
    const [message, context] = errorSpy.mock.calls[0] ?? [];
    expect(message).toBe('Router error');
    expect(context?.error).toEqual(new Error('loader failed'));
  });
});
