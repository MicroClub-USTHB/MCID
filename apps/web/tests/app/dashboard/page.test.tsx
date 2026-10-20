import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/auth';

import { makeUser, signInAs, signInAsRoot } from '../../helpers/auth';

vi.mock('@/app/dashboard/quick-stats', () => ({
  QuickStats: () => <div>quick stats</div>,
}));

import DashboardPage from '@/app/dashboard/page';

describe('DashboardPage', () => {
  it('greets the member by name and shows the quick stats', () => {
    useAuthStore.setState({ user: makeUser({ name: 'Ada' }) });
    render(<DashboardPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Welcome back, Ada' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('quick stats')).toBeInTheDocument();
  });

  it('links to the main areas and the docs', () => {
    signInAsRoot();
    render(<DashboardPage />);

    expect(screen.getByRole('link', { name: /Members/ })).toHaveAttribute(
      'href',
      '/dashboard/members'
    );
    expect(screen.getByRole('link', { name: /Servers/ })).toHaveAttribute(
      'href',
      '/dashboard/servers'
    );
    expect(screen.getByRole('link', { name: /Projects/ })).toHaveAttribute(
      'href',
      '/dashboard/projects'
    );
    expect(screen.getByRole('link', { name: /Docs/ })).toHaveAttribute('href', '/docs');
  });

  it('only links to the areas the member can read', () => {
    signInAs({ permissions: { servers: 'read' } });
    render(<DashboardPage />);

    expect(screen.getByRole('link', { name: /Servers/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Members/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Projects/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Docs/ })).toBeInTheDocument();
  });
});
