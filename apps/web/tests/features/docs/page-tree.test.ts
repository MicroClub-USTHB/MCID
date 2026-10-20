import { describe, expect, it } from 'vitest';

import { groupRuns, sectionOf, treeSections } from '@/features/docs/page-tree';

import { testSource } from './helpers/content';

describe('sectionOf', () => {
  it('names the folder a page sits in, the nearest one for nested pages', () => {
    expect(sectionOf(testSource.pageTree, '/docs/build/contributing')).toBe('Build MCID');
    expect(sectionOf(testSource.pageTree, '/docs/api-reference/admin/members')).toBe('Admin API');
    expect(sectionOf(testSource.pageTree, '/docs/integrate/inbound-webhooks/overview')).toBe(
      'Inbound webhooks'
    );
  });

  it('names nothing for a top-level folder index, the docs home or an unknown page', () => {
    expect(sectionOf(testSource.pageTree, '/docs/api-reference')).toBeNull();
    expect(sectionOf(testSource.pageTree, '/docs')).toBeNull();
    expect(sectionOf(testSource.pageTree, '/docs/nope')).toBeNull();
  });
});

describe('treeSections', () => {
  it('flattens nested folders into their top-level section, in sidebar order', () => {
    const integrate = treeSections(testSource.pageTree).find(
      (section) => section.name === 'Integrate with MCID'
    )!;

    expect(integrate.pages.map((page) => page.url)).toEqual([
      '/docs/integrate/sso',
      '/docs/integrate/api-keys',
      '/docs/integrate/roles-and-permissions',
      '/docs/integrate/inbound-webhooks/overview',
      '/docs/integrate/inbound-webhooks/schemas',
      '/docs/integrate/inbound-webhooks/signing-and-sending',
      '/docs/integrate/inbound-webhooks/reading-submissions',
      '/docs/integrate/inbound-webhooks/errors-and-limits',
      '/docs/integrate/conventions',
    ]);
  });

  it('starts the API reference section with its index page', () => {
    const reference = treeSections(testSource.pageTree).find(
      (section) => section.name === 'API reference'
    )!;

    expect(reference.url).toBe('/docs/api-reference');
    expect(reference.pages[0]?.url).toBe('/docs/api-reference');
  });
});

describe('groupRuns', () => {
  it('splits the API reference into its index, then the Project API and Admin API pages', () => {
    const reference = treeSections(testSource.pageTree).find(
      (section) => section.name === 'API reference'
    )!;

    expect(groupRuns(reference.pages).map((run) => run.group)).toEqual([
      undefined,
      'Project API',
      'Admin API',
    ]);
  });
});
