import { createContext, useContext } from 'react';

import type { Theme } from './theme';

export interface ThemeContextValue {
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
