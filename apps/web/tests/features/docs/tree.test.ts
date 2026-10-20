import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type * as PageTree from 'fumadocs-core/page-tree';
import { describe, expect, it } from 'vitest';

import { treeSections } from '@/features/docs/page-tree';

import { CONTENT_DIR, allFiles, metas, pages, testSource } from './helpers/content';

/** Every page URL the sidebar shows, folder index pages included. */
function urlsInTree(node: PageTree.Root | PageTree.Folder): string[] {
  const own = 'index' in node && node.index ? [node.index.url] : [];
  return [
    ...own,
    ...node.children.flatMap((child) =>
      child.type === 'page' ? [child.url] : child.type === 'folder' ? urlsInTree(child) : []
    ),
  ];
}

const folders = [...new Set(pages.map((page) => path.dirname(page.file)))];

describe('docs navigation (meta.json)', () => {
  it('has a meta.json with a title and a description in every folder', () => {
    for (const folder of folders) {
      const file = folder === '.' ? 'meta.json' : `${folder}/meta.json`;
      const meta = metas.find((candidate) => candidate.file === file);
      expect(meta, file).toBeDefined();
      expect(meta!.data.title?.trim().length ?? 0, file).toBeGreaterThan(0);
      expect(meta!.data.description?.trim().length ?? 0, file).toBeGreaterThan(0);
    }
  });

  it('lists only pages and folders that exist, so the sidebar never links to a missing page', () => {
    const missing = metas.flatMap((meta) => {
      const dir = path.dirname(meta.file);
      return (meta.data.pages ?? [])
        .filter((entry) => {
          const target = dir === '.' ? entry : `${dir}/${entry}`;
          return !allFiles.some(
            (file) => file === `${target}.mdx` || file.startsWith(`${target}/`)
          );
        })
        .map((entry) => `${meta.file}: ${entry}`);
    });

    expect(missing).toEqual([]);
  });

  it('reaches every page from the sidebar, so no page is orphaned', () => {
    const inTree = new Set(urlsInTree(testSource.pageTree));

    expect(pages.map((page) => page.url).filter((url) => !inTree.has(url))).toEqual([]);
  });

  it('names every page and folder in meta.json order, never by file order alone', () => {
    // A page missing from its folder's `pages` would be appended at the end, out of order.
    const unlisted = pages.flatMap((page) => {
      const dir = path.dirname(page.file);
      const name = path.basename(page.file, '.mdx');
      const meta = metas.find((m) => m.file === (dir === '.' ? 'meta.json' : `${dir}/meta.json`));
      if (name === 'index' && dir !== '.') return [];
      return meta?.data.pages?.includes(name) ? [] : [page.file];
    });
    const unlistedFolders = folders
      .filter((folder) => folder !== '.')
      .filter((folder) => {
        const parent = path.dirname(folder);
        const meta = metas.find(
          (m) => m.file === (parent === '.' ? 'meta.json' : `${parent}/meta.json`)
        );
        return !meta?.data.pages?.includes(path.basename(folder));
      });

    expect([...unlisted, ...unlistedFolders]).toEqual([]);
  });

  it('is not hidden by .gitignore, so the pages that pass here are the pages that get pushed', () => {
    const ignored = allFiles.filter(
      (file) => spawnSync('git', ['check-ignore', '-q', path.join(CONTENT_DIR, file)]).status === 0
    );

    expect(ignored).toEqual([]);
  });

  it('gives every page one unique, clean URL', () => {
    const urls = pages.map((page) => page.url);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((url) => /^\/docs(\/[a-z0-9-]+)*$/.test(url))).toBe(true);
  });

  it('starts with the docs home and then Start here, in the order of the old nav', () => {
    expect(testSource.pageTree.children[0]).toMatchObject({ type: 'page', url: '/docs' });
    expect(treeSections(testSource.pageTree).map((section) => section.name)).toEqual([
      'Start here',
      'Build MCID',
      'Integrate with MCID',
      'API reference',
    ]);
  });

  it('keeps every address the docs had, the API reference included', () => {
    for (const url of [
      '/docs',
      '/docs/start-here/what-is-mcid',
      '/docs/build/writing-docs',
      '/docs/integrate/inbound-webhooks/overview',
      '/docs/api-reference',
      '/docs/api-reference/project/overview',
      '/docs/api-reference/admin/members',
    ]) {
      expect(testSource.getPage(url.split('/').slice(2).filter(Boolean)), url).toBeDefined();
    }
  });
});
