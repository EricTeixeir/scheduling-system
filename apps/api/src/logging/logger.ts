import { pino, type DestinationStream, type Logger } from 'pino';

import type { Config } from '../config/env';

export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'token',
  '*.password',
  '*.token',
];

export function createLogger(level: Config['logLevel'], destination?: DestinationStream): Logger {
  const options = { level, redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } };
  return destination === undefined ? pino(options) : pino(options, destination);
}
