import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ModeToggle } from '@/shared/components/common/ModeToggle';
import { DEFAULT_THEME, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from '@/shared/lib/theme';

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

describe('theme', () => {
  it('defaults to dark, the Micro Club brand theme', () => {
    expect(DEFAULT_THEME).toBe('dark');
    render(<ModeToggle />);

    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
  });

  it('switches between dark and light and stores the choice', async () => {
    render(<ModeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Dark mode' });

    await userEvent.click(toggle);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(toggle).toBeChecked();
  });

  it('applies the stored or default mode before React renders, from the inline script', () => {
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
