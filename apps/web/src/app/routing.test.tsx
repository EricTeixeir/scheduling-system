import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { pathAfterSignIn } from '@/features/auth/return-path';
import { RequireAuth } from '@/features/auth/route-guards';
import { useApiClient } from '@/lib/api/api-client-context';
import {
  ADMIN_USER,
  CLIENT_USER,
  createFetchMock,
  jsonResponse,
  noContent,
  problemResponse,
} from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

import { AppShell } from './shell/app-shell';

const unauthenticated = () => problemResponse(401, { code: 'UNAUTHENTICATED' });

function signedOut() {
  return { 'GET /auth/me': unauthenticated, 'POST /auth/refresh': unauthenticated };
}

function signedInAs(user: typeof CLIENT_USER) {
  return { 'GET /auth/me': () => jsonResponse(user) };
}

describe('pathAfterSignIn', () => {
  it('returns to the page that asked for the sign in when the role can open it', () => {
    expect(pathAfterSignIn({ from: '/meus-agendamentos?aba=anteriores' }, 'CLIENT')).toBe(
      '/meus-agendamentos?aba=anteriores',
    );
  });

  it("goes home instead of to another role's page", () => {
    expect(pathAfterSignIn({ from: '/agendar' }, 'ADMIN')).toBe('/admin');
    expect(pathAfterSignIn({ from: '/admin' }, 'CLIENT')).toBe('/agendar');
  });

  it('ignores missing and external return paths', () => {
    expect(pathAfterSignIn(null, 'CLIENT')).toBe('/agendar');
    expect(pathAfterSignIn({ from: '//evil.example' }, 'CLIENT')).toBe('/agendar');
  });
});

describe('route guards', () => {
  it('sends an unauthenticated visitor to /login', async () => {
    const { fetch } = createFetchMock(signedOut());

    const { router } = renderApp({ path: '/agendar', fetch });

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/agendar' });
  });

  it('shows the 403 page when a client opens /admin, keeping the layout', async () => {
    const { fetch } = createFetchMock(signedInAs(CLIENT_USER));

    renderApp({ path: '/admin', fetch });

    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it.each([
    [CLIENT_USER, '/agendar', 'Agendar horário'],
    [ADMIN_USER, '/admin', 'Painel administrativo'],
  ])('lands $role on its home page', async (user, path, heading) => {
    const { fetch } = createFetchMock(signedInAs(user));

    const { router } = renderApp({ path: '/', fetch });

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
  });

  it('sends a signed-in user away from /login', async () => {
    const { fetch } = createFetchMock(signedInAs(ADMIN_USER));

    const { router } = renderApp({ path: '/login', fetch });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin');
    });
  });

  it('returns to the intended page after signing in', async () => {
    const user = userEvent.setup();
    const { fetch } = createFetchMock({
      ...signedOut(),
      'POST /auth/login': () => jsonResponse(CLIENT_USER),
    });
    const { router } = renderApp({ path: '/meus-agendamentos', fetch });

    await user.type(await screen.findByLabelText('E-mail'), 'maria@example.com');
    await user.type(screen.getByLabelText('Senha'), 'segura123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Meus agendamentos' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/meus-agendamentos');
  });

  it('shows a retry screen when the session check fails for a non-auth reason', async () => {
    const user = userEvent.setup();
    const { fetch } = createFetchMock({
      'GET /auth/me': [() => problemResponse(400), () => jsonResponse(CLIENT_USER)],
    });

    renderApp({ path: '/agendar', fetch });

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível verificar sua sessão' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Agendar horário' })).toBeInTheDocument();
  });

  it('shows the 404 page for unknown paths', async () => {
    const { fetch } = createFetchMock({});

    renderApp({ path: '/nao-existe', fetch });

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
  });
});

describe('session lifecycle', () => {
  function CallsProtectedEndpoint() {
    const api = useApiClient();
    return (
      <button
        type="button"
        onClick={() => {
          api.request('/appointments').catch(() => undefined);
        }}
      >
        Carregar
      </button>
    );
  }

  it('goes to /login with a notice when the session cannot be renewed', async () => {
    const user = userEvent.setup();
    const { fetch } = createFetchMock({
      'GET /auth/me': () => jsonResponse(CLIENT_USER),
      'GET /appointments': unauthenticated,
      'POST /auth/refresh': unauthenticated,
    });
    const { router } = renderApp({
      path: '/probe',
      fetch,
      routes: [
        { path: '/login', element: <h1>Entrar</h1> },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [{ path: '/probe', element: <CallsProtectedEndpoint /> }],
            },
          ],
        },
      ],
    });

    await user.click(await screen.findByRole('button', { name: 'Carregar' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(await screen.findByText('Sua sessão expirou. Entre novamente.')).toBeInTheDocument();
  });

  it('signs out from the mobile menu', async () => {
    const user = userEvent.setup();
    const { fetch, callsTo } = createFetchMock({
      'GET /auth/me': () => jsonResponse(CLIENT_USER),
      'POST /auth/logout': () => noContent(),
    });
    const { router } = renderApp({ path: '/agendar', fetch });

    await user.click(await screen.findByRole('button', { name: 'Abrir menu' }));
    const menu = await screen.findByRole('dialog');
    expect(within(menu).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(menu).getByText('Cliente')).toBeInTheDocument();
    await user.click(within(menu).getByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(callsTo('POST', '/auth/logout')).toHaveLength(1);
  });

  it('navigates from the mobile menu and closes it', async () => {
    const user = userEvent.setup();
    const { fetch } = createFetchMock(signedInAs(CLIENT_USER));
    const { router } = renderApp({ path: '/agendar', fetch });

    await user.click(await screen.findByRole('button', { name: 'Abrir menu' }));
    const menu = await screen.findByRole('dialog');
    await user.click(within(menu).getByRole('link', { name: 'Meus agendamentos' }));

    expect(router.state.location.pathname).toBe('/meus-agendamentos');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
