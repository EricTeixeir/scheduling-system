import type { ErrorCode } from '@scheduling/shared';

import { isApiError, type ApiError } from '../api/api-error';

export type MessageContext = 'default' | 'login';

export const GENERIC_ERROR_MESSAGE = 'Algo deu errado. Tente novamente.';
export const NETWORK_ERROR_MESSAGE =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
export const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

const CODE_MESSAGES: Partial<Record<ErrorCode, string>> = {
  SLOT_TAKEN: 'Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
  IN_PAST: 'Não é possível agendar em um horário que já passou.',
  TOO_SOON: 'Agende com pelo menos 1 hora de antecedência.',
  TOO_FAR: 'Esta data está além do limite permitido para agendamentos.',
  CLOSED_DATE: 'Não há atendimento nesta data. Escolha outro dia.',
  OUTSIDE_BUSINESS_HOURS: 'Este horário está fora do horário de atendimento.',
  MISALIGNED: 'Escolha um dos horários disponíveis na grade.',
  CANCEL_DEADLINE_PASSED: 'O prazo para cancelar este agendamento já terminou.',
  INVALID_TRANSITION: 'Este agendamento não pode mudar para o status escolhido.',
  ACTOR_NOT_ALLOWED: 'Você não tem permissão para esta ação.',
  NOT_STARTED_YET: 'O atendimento ainda não começou.',
  ALREADY_STARTED: 'O atendimento já começou.',
  VALIDATION_FAILED: 'Revise os campos destacados.',
  PAYLOAD_TOO_LARGE: 'Os dados enviados são grandes demais.',
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  401: SESSION_EXPIRED_MESSAGE,
  403: 'Você não tem permissão para acessar este recurso.',
  404: 'Não encontramos o que você procurava.',
  409: 'Esta ação conflita com uma alteração recente. Atualize a página e tente novamente.',
  422: 'Não foi possível concluir. Revise os dados informados.',
  429: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
  503: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
};

const SERVER_ERROR_MESSAGE = 'O servidor encontrou um problema. Tente novamente em instantes.';

function messageForApiError(error: ApiError, context: MessageContext): string {
  if (error.kind === 'network') return NETWORK_ERROR_MESSAGE;
  if (error.kind === 'invalid-response') return SERVER_ERROR_MESSAGE;
  if (error.status === 401 && context === 'login') return INVALID_CREDENTIALS_MESSAGE;

  const byCode = error.code === undefined ? undefined : CODE_MESSAGES[error.code];
  if (byCode !== undefined) return byCode;

  const byStatus = STATUS_MESSAGES[error.status];
  if (byStatus !== undefined) return byStatus;
  return error.status >= 500 ? SERVER_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
}

export function messageFor(error: unknown, context: MessageContext = 'default'): string {
  return isApiError(error) ? messageForApiError(error, context) : GENERIC_ERROR_MESSAGE;
}

export function fieldErrorsOf(error: unknown): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  if (!isApiError(error)) return fields;
  for (const { path, message } of error.fieldErrors) {
    if (!fields.has(path)) fields.set(path, message);
  }
  return fields;
}
