import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from '@/shared/components/layout/page-header';

describe('PageHeader', () => {
  it('renders the eyebrow, the page heading, the description and the actions', () => {
    render(
      <PageHeader
        eyebrow="Discord"
        title="Servers"
        description="Manage the Discord servers."
        actions={<button type="button">Add server</button>}
      />
    );

    expect(document.querySelector('header')).toHaveAttribute('data-slot', 'page-header');
    expect(screen.getByText('Discord')).toHaveAttribute('data-slot', 'page-header-eyebrow');
    expect(screen.getByRole('heading', { level: 1, name: 'Servers' })).toBeInTheDocument();
    expect(screen.getByText('Manage the Discord servers.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add server' }).parentElement).toHaveAttribute(
      'data-slot',
      'page-header-actions'
    );
  });

  it('leaves out the parts it is not given and renders extra lines and a leading node', () => {
    const { container } = render(
      <PageHeader title="Sync" leading={<span data-testid="avatar" />}>
        <p>Last changed today</p>
      </PageHeader>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Sync' })).toBeInTheDocument();
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    expect(screen.getByText('Last changed today')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="page-header-eyebrow"]')).toBeNull();
    expect(container.querySelector('[data-slot="page-header-actions"]')).toBeNull();
  });
});
