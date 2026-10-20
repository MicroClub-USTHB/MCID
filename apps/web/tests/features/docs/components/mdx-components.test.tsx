import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Callout } from '@/features/docs/components/callout';
import { Diagram } from '@/features/docs/components/diagram';
import { DocLink } from '@/features/docs/components/doc-link';
import { DocTable } from '@/features/docs/components/doc-table';
import { Steps } from '@/features/docs/components/steps';
import { getMDXComponents } from '@/features/docs/mdx';

import { pages, testSource } from '../helpers/content';

vi.mock('@/features/docs/source', async () => ({
  source: (await import('../helpers/content')).testSource,
}));

describe('getMDXComponents', () => {
  it('provides every component the docs content uses by name', () => {
    const used = new Set(
      pages.flatMap((page) => {
        // JSX in prose only: code blocks and inline code quote component names as text.
        const prose = page.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
        return [...prose.matchAll(/<([A-Z][A-Za-z]*)[\s/>]/g)].map((m) => m[1]!);
      })
    );
    const components = getMDXComponents();

    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter((name) => !(name in components))).toEqual([]);
  });

  it('uses the Fumadocs code block, headings and the docs link and table', () => {
    const components = getMDXComponents();

    expect(components.pre).toBeDefined();
    expect(components.h2).toBeDefined();
    expect(components.a).toBe(DocLink);
    expect(components.table).toBe(DocTable);
  });

  it('renders the docs home sections from the page tree', () => {
    const { DocsSections } = getMDXComponents() as { DocsSections: () => React.ReactNode };
    render(<>{DocsSections()}</>);

    expect(screen.getByRole('heading', { level: 2, name: 'Start here' })).toBeInTheDocument();
    expect(testSource.pageTree.children.length).toBeGreaterThan(1);
  });
});

describe('Callout', () => {
  it.each([
    ['note', 'Note'],
    ['tip', 'Tip'],
    ['warning', 'Warning'],
  ] as const)('labels a %s in words, so the meaning does not rest on colour', (type, label) => {
    render(<Callout type={type}>Mind the gap.</Callout>);

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(label);
    expect(note).toHaveTextContent('Mind the gap.');
  });

  it('is a note by default', () => {
    render(<Callout>Plain.</Callout>);

    expect(screen.getByRole('note')).toHaveTextContent('Note');
  });
});

describe('Steps', () => {
  it('keeps the numbered list it wraps, drawn as a procedure', () => {
    render(
      <Steps>
        <ol>
          <li>First</li>
          <li>Second</li>
        </ol>
      </Steps>
    );

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'First',
      'Second',
    ]);
    expect(screen.getByRole('list').parentElement).toHaveClass('docs-steps');
  });
});

describe('DocLink', () => {
  it('opens a docs link in the same tab', () => {
    render(<DocLink href="/docs/build/contributing">Contributing</DocLink>);

    const link = screen.getByRole('link', { name: 'Contributing' });
    expect(link).toHaveAttribute('href', '/docs/build/contributing');
    expect(link).not.toHaveAttribute('target');
  });

  it('keeps an in-page anchor in the page', () => {
    render(<DocLink href="#steps">Steps</DocLink>);

    expect(screen.getByRole('link', { name: 'Steps' })).toHaveAttribute('href', '#steps');
  });

  it('opens an outside link in a new tab without handing over the opener', () => {
    render(<DocLink href="https://discord.com/developers">Discord</DocLink>);

    const link = screen.getByRole('link', { name: /Discord/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});

describe('DocTable', () => {
  it('lets a wide table scroll inside its own box', () => {
    render(
      <DocTable>
        <thead>
          <tr>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </DocTable>
    );

    const box = screen.getByRole('table').parentElement;
    expect(box).toHaveClass('overflow-auto');
    // Focusable, so the keyboard can scroll it too.
    expect(box).toHaveAttribute('tabindex', '0');
  });
});

describe('Diagram', () => {
  it('shows a light and a dark image with the same description', () => {
    render(<Diagram src="/docs/x.svg" alt="Projects call the API." width={400} height={200} />);

    // CSS shows only the one that matches the active theme.
    const [light, dark] = screen.getAllByRole('img', { name: 'Projects call the API.' });
    expect(light?.getAttribute('src')).toContain('x.svg');
    expect(light).toHaveClass('dark:hidden');
    expect(dark?.getAttribute('src')).toContain('x-dark.svg');
    expect(dark).toHaveClass('hidden', 'dark:block');
  });
});
