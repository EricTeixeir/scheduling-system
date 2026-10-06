import { afterEach, describe, expect, it } from 'vitest';

import { createTestLogger } from '@/test/test-logger';

import { installGlobalErrorHandlers } from './global-error-handlers';

function unhandledRejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

let uninstall: () => void = () => undefined;

afterEach(() => {
  uninstall();
});

describe('installGlobalErrorHandlers', () => {
  it('sends uncaught errors to the logger', () => {
    const logger = createTestLogger();
    uninstall = installGlobalErrorHandlers(window, logger);
    const error = new Error('boom');

    window.dispatchEvent(
      new ErrorEvent('error', { error, message: 'boom', filename: 'app.js', lineno: 3, colno: 7 }),
    );

    expect(logger.error).toHaveBeenCalledWith('Uncaught error', {
      error,
      source: 'app.js',
      line: 3,
      column: 7,
    });
  });

  it('falls back to the message when the error object is missing', () => {
    const logger = createTestLogger();
    uninstall = installGlobalErrorHandlers(window, logger);

    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(logger.error).toHaveBeenCalledWith(
      'Uncaught error',
      expect.objectContaining({ error: 'Script error.' }),
    );
  });

  it('sends unhandled promise rejections to the logger', () => {
    const logger = createTestLogger();
    uninstall = installGlobalErrorHandlers(window, logger);
    const reason = new Error('rejected');

    window.dispatchEvent(unhandledRejectionEvent(reason));

    expect(logger.error).toHaveBeenCalledWith('Unhandled promise rejection', { error: reason });
  });

  it('installs only once: a second install replaces the first', () => {
    const first = createTestLogger();
    const second = createTestLogger();
    installGlobalErrorHandlers(window, first);
    uninstall = installGlobalErrorHandlers(window, second);

    window.dispatchEvent(unhandledRejectionEvent('x'));

    expect(first.error).not.toHaveBeenCalled();
    expect(second.error).toHaveBeenCalledOnce();
  });

  it('stops reporting after uninstall', () => {
    const logger = createTestLogger();
    installGlobalErrorHandlers(window, logger)();

    window.dispatchEvent(unhandledRejectionEvent('x'));

    expect(logger.error).not.toHaveBeenCalled();
  });
});
