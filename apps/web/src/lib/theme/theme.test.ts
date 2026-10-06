import { describe, expect, it } from 'vitest';

import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  THEME_STORAGE_KEY,
  themeFromSystem,
} from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('readStoredTheme', () => {
  it('returns a stored theme', () => {
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
  });

  it('ignores missing, unknown and unreadable values', () => {
    expect(readStoredTheme(memoryStorage())).toBeNull();
    expect(readStoredTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBeNull();
    expect(readStoredTheme(brokenStorage)).toBeNull();
    expect(readStoredTheme(undefined)).toBeNull();
  });
});

describe('storeTheme', () => {
  it('persists the theme and tolerates blocked storage', () => {
    const storage = memoryStorage();
    storeTheme(storage, 'light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(() => {
      storeTheme(brokenStorage, 'dark');
    }).not.toThrow();
  });
});

describe('themeFromSystem', () => {
  it('follows the color scheme preference and defaults to light', () => {
    expect(themeFromSystem({ matches: true })).toBe('dark');
    expect(themeFromSystem({ matches: false })).toBe('light');
    expect(themeFromSystem(undefined)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('toggles the dark class and the browser theme color', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);

    applyTheme('dark', document);
    expect(document.documentElement).toHaveClass('dark');
    const darkColor = meta.content;

    applyTheme('light', document);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(meta.content).not.toBe(darkColor);
    meta.remove();
  });
});
