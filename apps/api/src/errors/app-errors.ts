import type { ErrorCode, FieldError } from '@scheduling/shared';

import { problemTitle } from './problem-titles';

export interface AppErrorOptions {
  readonly detail?: string | undefined;
  readonly errors?: readonly FieldError[] | undefined;
}

export class AppError extends Error {
  override readonly name: string = 'AppError';
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: readonly FieldError[] | undefined;

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    { detail, errors }: AppErrorOptions = {},
  ) {
    const title = problemTitle(code);
    super(detail ?? title);
    this.title = title;
    this.detail = detail;
    this.errors = errors;
  }
}

export class ValidationError extends AppError {
  override readonly name = 'ValidationError';

  constructor(errors: readonly FieldError[], detail = 'Revise os campos destacados.') {
    super(422, 'VALIDATION_FAILED', { detail, errors });
  }
}

export type UnauthenticatedCode = Extract<ErrorCode, 'UNAUTHENTICATED' | 'REFRESH_RACE'>;

export class UnauthenticatedError extends AppError {
  override readonly name = 'UnauthenticatedError';

  constructor(detail?: string, code: UnauthenticatedCode = 'UNAUTHENTICATED') {
    super(401, code, { detail });
  }
}

export type ForbiddenCode = Extract<ErrorCode, 'FORBIDDEN' | 'ACTOR_NOT_ALLOWED'>;

export class ForbiddenError extends AppError {
  override readonly name = 'ForbiddenError';

  constructor(code: ForbiddenCode = 'FORBIDDEN', detail?: string) {
    super(403, code, { detail });
  }
}

export class NotFoundError extends AppError {
  override readonly name = 'NotFoundError';

  constructor(detail?: string) {
    super(404, 'NOT_FOUND', { detail });
  }
}

export type ConflictCode = Extract<ErrorCode, 'CONFLICT' | 'SLOT_TAKEN' | 'INVALID_TRANSITION'>;

export class ConflictError extends AppError {
  override readonly name = 'ConflictError';

  constructor(code: ConflictCode, detail?: string) {
    super(409, code, { detail });
  }
}

export type BusinessRuleCode = Extract<
  ErrorCode,
  | 'IN_PAST'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'CLOSED_DATE'
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'MISALIGNED'
  | 'CANCEL_DEADLINE_PASSED'
  | 'NOT_STARTED_YET'
  | 'ALREADY_STARTED'
>;

export class BusinessRuleError extends AppError {
  override readonly name = 'BusinessRuleError';

  constructor(code: BusinessRuleCode, detail?: string) {
    super(422, code, { detail });
  }
}

export class PayloadTooLargeError extends AppError {
  override readonly name = 'PayloadTooLargeError';

  constructor() {
    super(413, 'PAYLOAD_TOO_LARGE', {
      detail: 'O corpo da requisição excede o tamanho permitido.',
    });
  }
}

export class RateLimitedError extends AppError {
  override readonly name = 'RateLimitedError';

  constructor() {
    super(429, 'RATE_LIMITED', { detail: 'Aguarde alguns instantes e tente novamente.' });
  }
}

export class ServiceUnavailableError extends AppError {
  override readonly name = 'ServiceUnavailableError';

  constructor(detail?: string) {
    super(503, 'SERVICE_UNAVAILABLE', { detail });
  }
}

export class IdempotencyKeyReusedError extends AppError {
  override readonly name = 'IdempotencyKeyReusedError';

  constructor() {
    super(422, 'IDEMPOTENCY_KEY_REUSED', {
      detail:
        'Esta chave de idempotência já foi usada com outros dados. Gere uma nova chave para uma nova requisição.',
    });
  }
}
