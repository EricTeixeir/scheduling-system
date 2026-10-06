import type { ErrorCode } from '@scheduling/shared';

const PROBLEM_TITLES: Readonly<Record<ErrorCode, string>> = {
  IN_PAST: 'Horário no passado',
  TOO_SOON: 'Antecedência mínima não respeitada',
  TOO_FAR: 'Data além do limite para agendamento',
  CANCEL_DEADLINE_PASSED: 'Prazo de cancelamento encerrado',
  INVALID_TRANSITION: 'Mudança de status não permitida',
  ACTOR_NOT_ALLOWED: 'Ação não permitida para este usuário',
  NOT_STARTED_YET: 'O atendimento ainda não começou',
  ALREADY_STARTED: 'O atendimento já começou',
  CLOSED_DATE: 'Data sem atendimento',
  OUTSIDE_BUSINESS_HOURS: 'Fora do horário de atendimento',
  MISALIGNED: 'Horário fora da grade de atendimento',
  SLOT_TAKEN: 'Horário indisponível',
  SLOT_BLOCKED: 'Horário indisponível',
  BLOCK_CONFLICT: 'O bloqueio coincide com agendamentos confirmados',
  IDEMPOTENCY_KEY_REUSED: 'Chave de idempotência já usada em outra requisição',
  CONFLICT: 'Conflito com o estado atual do recurso',
  VALIDATION_FAILED: 'Dados inválidos',
  UNAUTHENTICATED: 'Autenticação necessária',
  REFRESH_RACE: 'Sessão renovada por outra aba',
  FORBIDDEN: 'Acesso negado',
  NOT_FOUND: 'Recurso não encontrado',
  PAYLOAD_TOO_LARGE: 'Requisição grande demais',
  RATE_LIMITED: 'Muitas requisições',
  SERVICE_UNAVAILABLE: 'Serviço indisponível',
  INTERNAL: 'Erro interno',
};

export function problemTitle(code: ErrorCode): string {
  // eslint-disable-next-line security/detect-object-injection -- code is a typed ErrorCode, never user input.
  return PROBLEM_TITLES[code];
}
