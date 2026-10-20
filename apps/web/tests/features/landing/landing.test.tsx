import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Home, { metadata } from '@/app/page';
import { DOCS_HREF, LANDING } from '@/features/landing/content';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('Landing page', () => {
  it('has one h1, the headline', () => {
    render(<Home />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(LANDING.headline);
  });

  it('keeps the subtext short enough to read at a glance', () => {
    expect(LANDING.subtext.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(LANDING.headline.split(/\s+/).length).toBeLessThanOrEqual(8);
  });

  it('sends the docs button to the docs of this site', () => {
    expect(DOCS_HREF).toBe('/docs');
  });

  it('offers the docs first and the admin sign-in second, in the hero', () => {
    render(<Home />);
    const hero = within(screen.getByRole('region', { name: LANDING.headline }));

    const links = hero.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      LANDING.docs.label,
      LANDING.signIn.label,
    ]);
    expect(links[0]).toHaveAttribute('href', DOCS_HREF);
    expect(links[1]).toHaveAttribute('href', '/login');
  });

  it('puts the admin sign-in in the site header too, with the same label', () => {
    render(<Home />);

    const header = within(screen.getByRole('banner'));

    expect(header.getByRole('link', { name: LANDING.signIn.label })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(header.getByRole('link', { name: 'MCID home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('highlights the key phrase of the headline', () => {
    render(<Home />);

    const accent = within(screen.getByRole('heading', { level: 1 })).getByText(
      LANDING.headlineAccent
    );
    expect(accent).toHaveClass('text-gradient-primary');
    expect(LANDING.headline).toBe(`${LANDING.headlineLead}${LANDING.headlineAccent}`);
  });

  it('copies the mcid-cli login command', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<Home />);

    expect(screen.getByText(LANDING.command.flag)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy command' }));

    expect(writeText).toHaveBeenCalledWith('npx mcid-cli login --profile prod');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('resets the copy button after a moment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Copy request' }));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Copy request' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('copies the token exchange request from the developers section', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Copy request' }));

    const copied = writeText.mock.calls[0]?.[0] ?? '';
    expect(copied).toContain('POST "$MCID_URL/auth/token"');
    expect(copied).toContain('X-API-Key: $MCID_API_KEY');
  });

  it('stays quiet when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Copy command' }));

    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument();
  });

  it('presents how it works, the features, the developer guide and a final call to action', () => {
    render(<Home />);

    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual([
      LANDING.howItWorks.title,
      LANDING.features.title,
      LANDING.developers.title,
      LANDING.finalCta.title,
    ]);
    expect(
      within(screen.getByRole('region', { name: LANDING.howItWorks.title })).getAllByRole(
        'listitem'
      )
    ).toHaveLength(3);
    expect(
      within(screen.getByRole('region', { name: LANDING.features.title })).getAllByRole('heading', {
        level: 3,
      })
    ).toHaveLength(LANDING.features.items.length);
    expect(screen.getByRole('link', { name: LANDING.developers.link.label })).toHaveAttribute(
      'href',
      '/docs/integrate/sso'
    );
  });

  it('shows the admin panel with a description for screen readers', () => {
    render(<Home />);

    // A light and a dark shot; CSS shows only the one for the active theme.
    const [light, dark] = screen.getAllByRole('img', { name: /admin panel/i });

    expect(light).toHaveAttribute('alt', LANDING.screenshot.alt);
    expect(light?.getAttribute('src')).toContain('admin-panel-light');
    expect(dark).toHaveAttribute('alt', LANDING.screenshot.alt);
    expect(dark?.getAttribute('src')).toContain('admin-panel-dark');
  });

  it('lets keyboard users skip to the content', () => {
    render(<Home />);

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content'
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('uses no em or en dashes anywhere in its copy', () => {
    expect(strings(LANDING).filter((text) => /[–—]/.test(text))).toEqual([]);
  });

  it('sets a title and a description of a sensible length', () => {
    expect(metadata.title).toEqual({ absolute: LANDING.metadata.title });
    expect(metadata.alternates?.canonical).toBe('/');
    expect(metadata.description?.length).toBeGreaterThan(50);
    expect(metadata.description?.length).toBeLessThanOrEqual(160);
  });
});
