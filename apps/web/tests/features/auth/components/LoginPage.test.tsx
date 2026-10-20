import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import LoginPage from '@/app/(auth)/login/page';

const REDIRECT_KEY = 'mcid.auth.post-login-redirect';

async function renderLogin(redirect?: string) {
  render(await LoginPage({ searchParams: Promise.resolve({ redirect }) }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('explains who signs in here and offers the Discord login', async () => {
    await renderLogin();

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to MCID' })).toBeInTheDocument();
    expect(screen.getByText(/sign in with their discord account/i)).toBeInTheDocument();
    expect(screen.getByText(/discord profile, email, servers and roles/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /login with discord/i })).toBeInTheDocument();
  });

  it('keeps a way home and the light and dark switch', async () => {
    await renderLogin();

    expect(screen.getByRole('link', { name: 'MCID home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('carries a safe redirect through the Discord button', async () => {
    await renderLogin('/dashboard/members');

    await userEvent.click(screen.getByRole('link', { name: /login with discord/i }));

    expect(window.sessionStorage.getItem(REDIRECT_KEY)).toBe('/dashboard/members');
  });

  it('drops an off-site redirect', async () => {
    await renderLogin('https://evil.example');

    await userEvent.click(screen.getByRole('link', { name: /login with discord/i }));

    expect(window.sessionStorage.getItem(REDIRECT_KEY)).toBe('/dashboard');
  });
});
