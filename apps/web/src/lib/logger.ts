export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly time: string;
  readonly context: LogContext;
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  addSink(sink: LogSink): () => void;
}

const CONSOLE_WRITERS: Readonly<Record<LogLevel, (...data: unknown[]) => void>> = {
  debug: (...data) => {
    console.debug(...data);
  },
  info: (...data) => {
    console.info(...data);
  },
  warn: (...data) => {
    console.warn(...data);
  },
  error: (...data) => {
    console.error(...data);
  },
};

export const consoleSink: LogSink = (entry) => {
  const write = CONSOLE_WRITERS[entry.level];
  write(`[${entry.level}] ${entry.message}`, entry);
};

// Error instances serialize to "{}" in JSON, which would lose the cause in any remote sink.
export function serializeError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error.cause === undefined ? {} : { cause: serializeError(error.cause) }),
    };
  }
  return error;
}

function normalizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, serializeError(value)]),
  );
}

export function createLogger(initialSinks: readonly LogSink[] = [consoleSink]): Logger {
  const sinks = new Set<LogSink>(initialSinks);

  function write(level: LogLevel, message: string, context: LogContext = {}) {
    const entry: LogEntry = {
      level,
      message,
      time: new Date().toISOString(),
      context: normalizeContext(context),
    };
    for (const sink of sinks) {
      try {
        sink(entry);
      } catch {
        // A broken sink must not break the app nor the other sinks; there is nowhere left to report.
      }
    }
  }

  return {
    debug: (message, context) => {
      write('debug', message, context);
    },
    info: (message, context) => {
      write('info', message, context);
    },
    warn: (message, context) => {
      write('warn', message, context);
    },
    error: (message, context) => {
      write('error', message, context);
    },
    addSink(sink) {
      sinks.add(sink);
      return () => {
        sinks.delete(sink);
      };
    },
  };
}

export const logger = createLogger();
