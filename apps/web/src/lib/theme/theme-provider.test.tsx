import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from '@/components/theme-toggle';

import { THEME_STORAGE_KEY } from './theme';
import { ThemeProvider } from './theme-provider';

function fakeMediaQuery(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    change(next: boolean) {
      query.matches = next;
      for (const listener of listeners) listener();
    },
  };
  return query;
}

function renderToggle(options: { stored?: string; systemDark?: boolean } = {}) {
  const storage = new Map<string, string>(
    options.stored === undefined ? [] : [[THEME_STORAGE_KEY, options.stored]],
  );
  const media = fakeMediaQuery(options.systemDark ?? false);
  render(
    <ThemeProvider
      storage={{
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      }}
      prefersDark={media as unknown as MediaQueryList}
    >
      <ThemeToggle />
    </ThemeProvider>,
  );
  return { storage, media };
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('ThemeProvider with ThemeToggle', () => {
  it('starts from the system preference', () => {
    renderToggle({ systemDark: true });
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Ativar modo claro' })).toBeInTheDocument();
  });

  it('prefers the stored choice over the system', () => {
    renderToggle({ stored: 'light', systemDark: true });
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('toggles and remembers the choice', async () => {
    const { storage } = renderToggle();
    await userEvent.click(screen.getByRole('button', { name: 'Ativar modo escuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(storage.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('follows system changes until the user chooses', async () => {
    const { media } = renderToggle();
    act(() => {
      media.change(true);
    });
    expect(document.documentElement).toHaveClass('dark');

    await userEvent.click(screen.getByRole('button', { name: 'Ativar modo claro' }));
    act(() => {
      media.change(true);
    });
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
