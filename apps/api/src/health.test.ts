import { isNonEmptyString } from '@scheduling/shared';
import { describe, expect, it } from 'vitest';

import { buildHealthStatus } from './health';

describe('buildHealthStatus', () => {
  it('reports the service as ok', () => {
    expect(buildHealthStatus('api')).toEqual({ status: 'ok', service: 'api' });
  });

  it('rejects a blank service name', () => {
    expect(() => buildHealthStatus(' ')).toThrow('non-empty string');
  });
});

describe('workspace resolution', () => {
  it('imports @scheduling/shared from the api workspace', () => {
    expect(isNonEmptyString('api')).toBe(true);
  });
});
