import { logger as defaultLogger, type Logger } from './logger';

let uninstallCurrent: (() => void) | undefined;

export function installGlobalErrorHandlers(
  target: Window = window,
  logger: Logger = defaultLogger,
): () => void {
  uninstallCurrent?.();

  const onError = (event: ErrorEvent) => {
    logger.error('Uncaught error', {
      error: event.error ?? event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    logger.error('Unhandled promise rejection', { error: event.reason });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onUnhandledRejection);

  const uninstall = () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onUnhandledRejection);
    if (uninstallCurrent === uninstall) uninstallCurrent = undefined;
  };
  uninstallCurrent = uninstall;
  return uninstall;
}
