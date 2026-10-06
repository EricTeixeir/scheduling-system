import { useCallback, useSyncExternalStore } from 'react';

function mediaQueryListIfSupported(query: string): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaQueryListIfSupported(query);
      list?.addEventListener('change', onChange);
      return () => {
        list?.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => mediaQueryListIfSupported(query)?.matches ?? false,
    () => false,
  );
}
