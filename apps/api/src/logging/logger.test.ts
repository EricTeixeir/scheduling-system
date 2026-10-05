import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from './logger';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { stream, lines };
}

describe('createLogger', () => {
  it('writes JSON and redacts credentials, cookies and secrets', () => {
    const { stream, lines } = capture();
    const logger = createLogger('info', stream);
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc', cookie: 'session=abc', host: 'api' } },
        res: { headers: { 'set-cookie': 'session=abc' } },
        password: 'hunter2',
        body: { password: 'hunter2', token: 'tok', email: 'ana@example.com' },
      },
      'request',
    );
    expect(lines).toHaveLength(1);
    const entry: unknown = JSON.parse(lines[0] ?? '');
    expect(entry).toMatchObject({
      msg: 'request',
      req: { headers: { authorization: '[REDACTED]', cookie: '[REDACTED]', host: 'api' } },
      res: { headers: { 'set-cookie': '[REDACTED]' } },
      password: '[REDACTED]',
      body: { password: '[REDACTED]', token: '[REDACTED]', email: 'ana@example.com' },
    });
    expect(lines[0]).not.toContain('hunter2');
    expect(lines[0]).not.toContain('abc');
  });

  it('respects the level', () => {
    const { stream, lines } = capture();
    const logger = createLogger('warn', stream);
    logger.info('hidden');
    logger.warn('shown');
    expect(lines).toHaveLength(1);
  });
});
