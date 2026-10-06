import { afterEach, describe, expect, it, vi } from 'vitest';

import { consoleSink, createLogger, serializeError, type LogEntry, type Logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it('sends structured entries to every sink', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger([(entry) => entries.push(entry)]);

    logger.info('Booked', { appointmentId: 'a1' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'info',
      message: 'Booked',
      context: { appointmentId: 'a1' },
    });
    expect(Number.isNaN(Date.parse(entries[0]?.time ?? ''))).toBe(false);
  });

  it.each([
    [
      'debug',
      (logger: Logger) => {
        logger.debug('x');
      },
    ],
    [
      'info',
      (logger: Logger) => {
        logger.info('x');
      },
    ],
    [
      'warn',
      (logger: Logger) => {
        logger.warn('x');
      },
    ],
    [
      'error',
      (logger: Logger) => {
        logger.error('x');
      },
    ],
  ] as const)('supports the %s level', (level, write) => {
    const sink = vi.fn();
    write(createLogger([sink]));
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ level, context: {} }));
  });

  it('serializes errors in the context so a remote sink keeps the cause', () => {
    const entries: LogEntry[] = [];
    const logger = createLogger([(entry) => entries.push(entry)]);

    logger.error('Failed', { error: new Error('outer', { cause: new Error('inner') }) });

    expect(entries[0]?.context).toMatchObject({
      error: { name: 'Error', message: 'outer', cause: { name: 'Error', message: 'inner' } },
    });
  });

  it('adds and removes sinks', () => {
    const extra = vi.fn();
    const logger = createLogger([]);
    const remove = logger.addSink(extra);

    logger.warn('one');
    remove();
    logger.warn('two');

    expect(extra).toHaveBeenCalledOnce();
  });

  it('keeps going when a sink throws', () => {
    const healthy = vi.fn();
    const logger = createLogger([
      () => {
        throw new Error('sink down');
      },
      healthy,
    ]);

    expect(() => {
      logger.error('x');
    }).not.toThrow();
    expect(healthy).toHaveBeenCalledOnce();
  });
});

describe('consoleSink', () => {
  it.each(['debug', 'info', 'warn', 'error'] as const)(
    'writes %s to the matching console method',
    (level) => {
      const spy = vi.spyOn(console, level).mockImplementation(() => undefined);
      const entry: LogEntry = { level, message: 'hello', time: 't', context: {} };

      consoleSink(entry);

      expect(spy).toHaveBeenCalledWith(`[${level}] hello`, entry);
    },
  );
});

describe('serializeError', () => {
  it('returns non-errors unchanged', () => {
    expect(serializeError('text')).toBe('text');
  });
});
