import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CLIENT_USER, createFetchMock, jsonResponse, problemResponse } from '@/test/fetch-mock';
import { renderApp } from '@/test/render-app';

const unauthenticated = () => problemResponse(401, { code: 'UNAUTHENTICATED' });
const signedOut = { 'GET /auth/me': unauthenticated, 'POST /auth/refresh': unauthenticated };

async function submitLogin(loginResponse: () => Response | Promise<Response>) {
  const user = userEvent.setup();
  const mock = createFetchMock({ ...signedOut, 'POST /auth/login': loginResponse });
  const view = renderApp({ path: '/login', fetch: mock.fetch });
  await user.type(await screen.findByLabelText('E-mail'), ' Maria@Example.com ');
  await user.type(screen.getByLabelText('Senha'), 'segura123');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return { ...mock, ...view, user };
}

describe('LoginPage', () => {
  it('signs in with the normalized e-mail and lands the client on /agendar', async () => {
    const { router, callsTo } = await submitLogin(() => jsonResponse(CLIENT_USER));

    expect(await screen.findByRole('heading', { name: 'Agendar horário' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/agendar');
    expect(callsTo('POST', '/auth/login')[0]?.body).toEqual({
      email: 'maria@example.com',
      password: 'segura123',
    });
  });

  it('shows "E-mail ou senha inválidos." on 401', async () => {
    await submitLogin(unauthenticated);

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it.each([
    [
      problemResponse(403, { code: 'FORBIDDEN' }),
      'Você não tem permissão para acessar este recurso.',
    ],
    [
      problemResponse(409, { code: 'CONFLICT' }),
      'Esta ação conflita com uma alteração recente. Atualize a página e tente novamente.',
    ],
    [
      problemResponse(429, { code: 'RATE_LIMITED' }),
      'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
    ],
    [
      problemResponse(500, { code: 'INTERNAL' }),
      'O servidor encontrou um problema. Tente novamente em instantes.',
    ],
  ])('shows the right message for %#', async (response, message) => {
    await submitLogin(() => response);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('explains a network failure', async () => {
    await submitLogin(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao servidor.',
    );
  });

  it('renders 422 field errors next to their fields', async () => {
    await submitLogin(() =>
      problemResponse(422, {
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'password', message: 'Senha recusada pelo servidor.' }],
      }),
    );

    const password = screen.getByLabelText('Senha');
    expect(await screen.findByText('Senha recusada pelo servidor.')).toBeInTheDocument();
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Senha recusada pelo servidor.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('validates on the client with the shared schema messages', async () => {
    const user = userEvent.setup();
    const mock = createFetchMock(signedOut);
    renderApp({ path: '/login', fetch: mock.fetch });

    await user.type(await screen.findByLabelText('E-mail'), 'maria');
    await user.type(screen.getByLabelText('Senha'), 'curta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail inválido.')).toBeInTheDocument();
    expect(screen.getByText('A senha deve ter no mínimo 8 caracteres.')).toBeInTheDocument();
    expect(mock.callsTo('POST', '/auth/login')).toHaveLength(0);
  });

  it('disables the button while signing in', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await submitLogin(async () => {
      await gate;
      return jsonResponse(CLIENT_USER);
    });

    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled();
    release();
    expect(await screen.findByRole('heading', { name: 'Agendar horário' })).toBeInTheDocument();
  });

  it('shows and hides the password', async () => {
    const user = userEvent.setup();
    renderApp({ path: '/login', fetch: createFetchMock(signedOut).fetch });
    const password = await screen.findByLabelText('Senha');

    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

describe('RegisterPage', () => {
  async function submitRegistration(response: () => Response) {
    const user = userEvent.setup();
    const mock = createFetchMock({ ...signedOut, 'POST /auth/register': response });
    const view = renderApp({ path: '/cadastro', fetch: mock.fetch });
    await user.type(await screen.findByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await user.type(screen.getByLabelText('Senha'), 'segura123');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    return { ...mock, ...view };
  }

  it('creates the account and signs the user in', async () => {
    const { router, callsTo } = await submitRegistration(() => jsonResponse(CLIENT_USER, 201));

    expect(await screen.findByRole('heading', { name: 'Agendar horário' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/agendar');
    expect(callsTo('POST', '/auth/register')[0]?.body).toEqual({
      name: 'Maria Silva',
      email: 'maria@example.com',
      password: 'segura123',
    });
  });

  it('shows "e-mail já cadastrado" next to the e-mail field on 409', async () => {
    await submitRegistration(() => problemResponse(409, { code: 'CONFLICT' }));

    expect(await screen.findByText('Este e-mail já está cadastrado.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders 422 field errors next to their fields', async () => {
    await submitRegistration(() =>
      problemResponse(422, {
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'name', message: 'Nome recusado.' }],
      }),
    );

    expect(await screen.findByText('Nome recusado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Nome recusado.');
  });

  it('shows the rate-limit message on 429', async () => {
    await submitRegistration(() => problemResponse(429, { code: 'RATE_LIMITED' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas em pouco tempo.');
  });

  it('links back to the login page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp({ path: '/cadastro', fetch: createFetchMock(signedOut).fetch });

    await user.click(await screen.findByRole('link', { name: 'Entrar' }));

    expect(router.state.location.pathname).toBe('/login');
  });
});
