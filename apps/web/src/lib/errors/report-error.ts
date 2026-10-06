import { isApiError } from '../api/api-error';
import { logger as defaultLogger, type LogContext, type Logger } from '../logger';

export function isClientError(error: unknown): boolean {
  return isApiError(error) && error.kind === 'http' && error.status >= 400 && error.status < 500;
}

export function reportError(
  message: string,
  error: unknown,
  context: LogContext = {},
  logger: Logger = defaultLogger,
): void {
  const details = isApiError(error)
    ? { ...context, status: error.status, code: error.code, kind: error.kind, error }
    : { ...context, error };
  if (isClientError(error)) logger.warn(message, details);
  else logger.error(message, details);
}
