import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

function fakeMediaQueryList(initiallyMatches: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches: initiallyMatches,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  const change = (matches: boolean) => {
    list.matches = matches;
    for (const listener of listeners) listener();
  };
  return { list, change, listeners };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false where matchMedia is not supported', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('follows the media query as it changes and unsubscribes on unmount', () => {
    const fake = fakeMediaQueryList(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => fake.list),
    );
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));

    expect(result.current).toBe(false);
    act(() => {
      fake.change(true);
    });
    expect(result.current).toBe(true);
    unmount();
    expect(fake.listeners.size).toBe(0);
  });
});
