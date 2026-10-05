import { describe, expect, it } from 'vitest';

import { isNonEmptyString } from './strings';

describe('isNonEmptyString', () => {
  it('accepts a string with visible characters', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it.each(['', '   ', 42, null, undefined])('rejects %j', (value) => {
    expect(isNonEmptyString(value)).toBe(false);
  });
});
