import { describe, expect, it } from 'vitest';

import { ApiError, type ApiErrorInit } from '../api/api-error';
import {
  fieldErrorsOf,
  GENERIC_ERROR_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  messageFor,
  NETWORK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from './messages';
import { splitServerErrors } from './server-form-errors';

function httpError(status: number, extra: Partial<ApiErrorInit> = {}): ApiError {
  return new ApiError({ kind: 'http', status, title: 'Problem', ...extra });
}

describe('messageFor', () => {
  it.each([
    [401, SESSION_EXPIRED_MESSAGE],
    [403, 'Você não tem permissão para acessar este recurso.'],
    [404, 'Não encontramos o que você procurava.'],
    [409, 'Esta ação conflita com uma alteração recente. Atualize a página e tente novamente.'],
    [422, 'Não foi possível concluir. Revise os dados informados.'],
    [429, 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.'],
    [500, 'O servidor encontrou um problema. Tente novamente em instantes.'],
    [502, 'O servidor encontrou um problema. Tente novamente em instantes.'],
    [503, 'O serviço está temporariamente indisponível. Tente novamente em instantes.'],
    [418, GENERIC_ERROR_MESSAGE],
  ])('maps status %i', (status, message) => {
    expect(messageFor(httpError(status))).toBe(message);
  });

  it('says "e-mail ou senha inválidos" for a 401 on the login form', () => {
    expect(messageFor(httpError(401, { code: 'UNAUTHENTICATED' }), 'login')).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it.each([
    [
      409,
      'SLOT_TAKEN',
      'Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
    ],
    [422, 'TOO_SOON', 'Agende com pelo menos 1 hora de antecedência.'],
    [422, 'IN_PAST', 'Não é possível agendar em um horário que já passou.'],
    [422, 'CANCEL_DEADLINE_PASSED', 'O prazo para cancelar este agendamento já terminou.'],
    [422, 'VALIDATION_FAILED', 'Revise os campos destacados.'],
  ] as const)('prefers the domain code (%i %s)', (status, code, message) => {
    expect(messageFor(httpError(status, { code }))).toBe(message);
  });

  it('falls back to the status when the code has no specific message', () => {
    expect(messageFor(httpError(403, { code: 'FORBIDDEN' }))).toBe(
      'Você não tem permissão para acessar este recurso.',
    );
  });

  it('explains a network failure', () => {
    expect(messageFor(new ApiError({ kind: 'network', status: 0, title: 'x' }))).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  it('treats a response outside the contract as a server problem', () => {
    expect(messageFor(new ApiError({ kind: 'invalid-response', status: 200, title: 'x' }))).toBe(
      'O servidor encontrou um problema. Tente novamente em instantes.',
    );
  });

  it('never leaks the text of an unknown error', () => {
    expect(messageFor(new Error('SELECT * FROM users'))).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('fieldErrorsOf', () => {
  it('keeps the first message per path', () => {
    const error = httpError(422, {
      fieldErrors: [
        { path: 'email', message: 'E-mail inválido.' },
        { path: 'email', message: 'Outro.' },
      ],
    });
    expect([...fieldErrorsOf(error)]).toEqual([['email', 'E-mail inválido.']]);
  });

  it('is empty for errors that are not ApiError', () => {
    expect(fieldErrorsOf(new Error('x')).size).toBe(0);
  });
});

describe('splitServerErrors', () => {
  const fields = ['email', 'password'] as const;

  it('shows field errors inline and no form message when all fields are known', () => {
    const error = httpError(422, {
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ path: 'email', message: 'E-mail inválido.' }],
    });
    const result = splitServerErrors(error, fields);
    expect([...result.fields]).toEqual([['email', 'E-mail inválido.']]);
    expect(result.formMessage).toBeUndefined();
  });

  it('adds a form message when some field error has no matching input', () => {
    const error = httpError(422, {
      code: 'VALIDATION_FAILED',
      fieldErrors: [{ path: 'role', message: 'Campo não permitido.' }],
    });
    expect(splitServerErrors(error, fields).formMessage).toBe('Revise os campos destacados.');
  });

  it('uses the context for errors without fields', () => {
    expect(splitServerErrors(httpError(401), fields, 'login').formMessage).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });
});
