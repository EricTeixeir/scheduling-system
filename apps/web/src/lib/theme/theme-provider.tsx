import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  themeFromSystem,
  type Theme,
  type ThemeStorage,
} from './theme';
import { ThemeContext, type ThemeContextValue } from './theme-context';

interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly storage?: ThemeStorage | undefined;
  readonly prefersDark?: MediaQueryList | undefined;
  readonly document?: Document;
}

function browserStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserPrefersDark(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined;
}

export function ThemeProvider({
  children,
  storage = browserStorage(),
  prefersDark = browserPrefersDark(),
  document = window.document,
}: ThemeProviderProps) {
  const [chosen, setChosen] = useState<Theme | null>(() => readStoredTheme(storage));
  const [system, setSystem] = useState<Theme>(() => themeFromSystem(prefersDark));
  const theme = chosen ?? system;

  useLayoutEffect(() => {
    applyTheme(theme, document);
  }, [theme, document]);

  useEffect(() => {
    if (!prefersDark) return;
    const follow = () => {
      setSystem(themeFromSystem(prefersDark));
    };
    prefersDark.addEventListener('change', follow);
    return () => {
      prefersDark.removeEventListener('change', follow);
    };
  }, [prefersDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        storeTheme(storage, next);
        setChosen(next);
      },
    }),
    [theme, storage],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}
