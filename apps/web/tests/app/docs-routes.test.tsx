import type * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Page, { generateMetadata, generateStaticParams } from '@/app/docs/[[...slug]]/page';
import sitemap from '@/app/sitemap';
import { DocsSections } from '@/features/docs/components/docs-sections';
import { treeSections } from '@/features/docs/page-tree';

import { pages, testSource } from '../features/docs/helpers/content';

// The real source is the collection fumadocs-mdx generates at build time; this one is built
// from the same files with the same loader (see the helper).
vi.mock('@/features/docs/source', async () => ({
  source: (await import('../features/docs/helpers/content')).testSource,
}));

// The Notebook page parts need the layout's providers; the route's own job is what goes in them.
vi.mock('fumadocs-ui/layouts/notebook/page', () => ({
  DocsPage: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
  DocsTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DocsDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DocsBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const params = (slug?: string[]) => ({ params: Promise.resolve({ slug }) });

describe('docs routes', () => {
  it('builds one static page for every page of the content, the docs home included', () => {
    const built = generateStaticParams().map((entry) => `/docs/${entry.slug.join('/')}`);

    expect(built.map((url) => url.replace(/\/$/, '')).sort()).toEqual(
      pages.map((page) => page.url).sort()
    );
  });

  it('takes the title and description from the frontmatter, with the section and a canonical', async () => {
    const metadata = await generateMetadata(params(['build', 'contributing']));

    expect(metadata.title).toBe('Contributing | Build MCID');
    expect(metadata.description).toMatch(/issues, branches, pull requests/);
    expect(metadata.alternates?.canonical).toBe('/docs/build/contributing');
  });

  it('tells the two Members pages apart by their API', async () => {
    expect((await generateMetadata(params(['api-reference', 'admin', 'members']))).title).toBe(
      'Members | Admin API'
    );
    expect((await generateMetadata(params(['api-reference', 'project', 'members']))).title).toBe(
      'Members | Project API'
    );
  });

  it('has metadata for the docs home and the API reference index', async () => {
    expect((await generateMetadata(params())).title).toBe('MCID developer documentation');
    expect((await generateMetadata(params(['api-reference']))).title).toBe('API reference');
  });

  it('answers 404 for a page that does not exist', async () => {
    await expect(generateMetadata(params(['nope']))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/
    );
    await expect(Page(params(['does', 'not-exist']))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/
    );
  });

  it('renders a page with its title as the only h1 and its description under it', async () => {
    render(await Page(params(['start-here', 'what-is-mcid'])));

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What is MCID');
    expect(
      screen.getByText(testSource.getPage(['start-here', 'what-is-mcid'])!.data.description!)
    ).toBeInTheDocument();
  });
});

describe('docs home', () => {
  it('links to every page, grouped by section', () => {
    render(<DocsSections tree={testSource.pageTree} />);

    for (const section of treeSections(testSource.pageTree)) {
      const card = screen.getByRole('region', { name: section.name });
      expect(section.pages.length).toBeGreaterThan(0);
      const hrefs = within(card)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]);
      for (const page of section.pages) expect(hrefs).toContainEqual([page.name, page.url]);
    }
    const linked = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(pages.filter((page) => page.url !== '/docs' && !linked.includes(page.url))).toEqual([]);
  });
});

describe('sitemap', () => {
  it('lists the landing page, the docs home and every docs page', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain('http://localhost:3002/');
    expect(urls).toContain('http://localhost:3002/docs');
    for (const page of pages) {
      expect(urls).toContain(`http://localhost:3002${page.url}`);
    }
  });
});
