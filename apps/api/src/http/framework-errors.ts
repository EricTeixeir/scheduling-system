import { AppError, PayloadTooLargeError } from '../errors/app-errors';

function fastifyErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function translateFrameworkError(error: unknown): AppError | undefined {
  switch (fastifyErrorCode(error)) {
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return new AppError(400, 'VALIDATION_FAILED', {
        detail: 'O corpo da requisição não é um JSON válido.',
      });
    case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
    case 'FST_ERR_BAD_URL':
      return new AppError(400, 'VALIDATION_FAILED', { detail: 'Requisição malformada.' });
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return new AppError(415, 'VALIDATION_FAILED', {
        detail: 'Envie o corpo da requisição como application/json.',
      });
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return new PayloadTooLargeError();
    default:
      return undefined;
  }
}
