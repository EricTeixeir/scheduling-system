import { describe, expect, it } from 'vitest';

import { transitionError } from './transition-errors';

describe('transitionError', () => {
  it.each([
    ['INVALID_TRANSITION', 409],
    ['ACTOR_NOT_ALLOWED', 403],
    ['CANCEL_DEADLINE_PASSED', 422],
    ['NOT_STARTED_YET', 422],
    ['ALREADY_STARTED', 422],
  ] as const)('maps %s to HTTP %i', (reason, status) => {
    expect(transitionError(reason, 'detalhe')).toMatchObject({ status, code: reason });
  });

  it('uses the caller’s detail only for an invalid transition', () => {
    expect(transitionError('INVALID_TRANSITION', 'detalhe').detail).toBe('detalhe');
    expect(transitionError('ALREADY_STARTED', 'detalhe').detail).toBeUndefined();
  });
});
