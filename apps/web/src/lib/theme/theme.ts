export type Theme = 'light' | 'dark';

export type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const THEME_STORAGE_KEY = 'agendo.theme';

const LIGHT_THEME_COLOR = '#f8f9fc';
const DARK_THEME_COLOR = '#11131f';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

// Storage throws in private mode or when site data is blocked; the theme then lasts for the visit.
export function readStoredTheme(storage: ThemeStorage | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(storage: ThemeStorage | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    return;
  }
}

export function themeFromSystem(prefersDark: Pick<MediaQueryList, 'matches'> | undefined): Theme {
  return prefersDark?.matches === true ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, document: Document): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}
