import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { remarkGfm, remarkHeading } from 'fumadocs-core/mdx-plugins';
import { describe, expect, it } from 'vitest';

import { findPage, pages } from './helpers/content';

const WEB = path.resolve(__dirname, '../../..');

/** The remark plugins Fumadocs runs on every page: GFM tables and the heading ids of the TOC. */
const PIPELINE = { remarkPlugins: [remarkGfm, remarkHeading] };

async function compiled(body: string) {
  const file = await compile(body, PIPELINE);
  const toc = (file.data.toc ?? []) as { url: string }[];
  return { output: String(file), ids: new Set(toc.map((item) => item.url.slice(1))) };
}

const idsByUrl = new Map<string, Promise<Set<string>>>();
const idsOf = (url: string) => {
  if (!idsByUrl.has(url))
    idsByUrl.set(
      url,
      compiled(findPage(url)!.body).then((c) => c.ids)
    );
  return idsByUrl.get(url)!;
};

/** The lines that are prose, with the lines inside code fences set aside. */
function split(source: string) {
  const prose: string[] = [];
  const fences: { info: string; line: number }[] = [];
  let open = false;
  source.split('\n').forEach((line, index) => {
    const marker = line.match(/^\s*```(.*)$/);
    if (marker) {
      if (!open) fences.push({ info: marker[1]!.trim(), line: index + 1 });
      open = !open;
      return;
    }
    if (!open) prose.push(line);
  });
  return { prose, fences };
}

describe.each(pages)('docs page $file', (page) => {
  const { prose, fences } = split(page.body);

  it('is valid MDX', async () => {
    await expect(compiled(page.body)).resolves.toBeDefined();
  });

  it('has a title and a description that fits a search snippet, in its frontmatter', () => {
    expect(page.source.startsWith('---\n')).toBe(true);
    expect(page.data.title?.trim().length ?? 0).toBeGreaterThan(0);
    expect(page.data.description?.length ?? 0).toBeGreaterThanOrEqual(30);
    expect(page.data.description?.length ?? 0).toBeLessThanOrEqual(160);
  });

  it('turns every markdown table into a real table', async () => {
    const hasTableSyntax = prose.some((line) => /^\s*\|?\s*-{3,}\s*\|/.test(line));
    const { output } = await compiled(page.body);

    expect(output.includes('_components.table')).toBe(hasTableSyntax);
  });

  it('has no h1, because the page title comes from the frontmatter', () => {
    expect(prose.filter((line) => /^#\s/.test(line))).toEqual([]);
  });

  it('names the language of every code block', () => {
    expect(
      fences.filter((fence) => fence.info === '').map((fence) => `line ${fence.line}`)
    ).toEqual([]);
  });

  // Prose only: program output inside a code block is quoted exactly, dashes and all.
  it('uses no em or en dashes in its prose, title or description', () => {
    const text = [page.data.title, page.data.description, ...prose].join('\n');
    expect(text.match(/[–—]/g) ?? []).toEqual([]);
  });

  it('ends by naming the files it describes', () => {
    const last = prose.filter((line) => line.trim() !== '').at(-1) ?? '';

    expect(last.startsWith('Source:')).toBe(true);
  });

  it('only links to pages and headings that exist', async () => {
    const problems: string[] = [];
    for (const [, target] of prose.join('\n').matchAll(/\]\((\/docs[^)\s]*)\)/g)) {
      const [route, anchor] = target!.split('#');
      const url = route!.replace(/\/$/, '');
      if (!findPage(url)) {
        problems.push(`${target}: no such page`);
        continue;
      }
      if (anchor && !(await idsOf(url)).has(anchor)) problems.push(`${target}: no such heading`);
    }

    expect(problems).toEqual([]);
  });

  it('keeps in-page anchors pointing at real headings', async () => {
    const { ids } = await compiled(page.body);
    const missing = [...prose.join('\n').matchAll(/\]\(#([^)\s]+)\)/g)]
      .map((match) => match[1]!)
      .filter((id) => !ids.has(id));

    expect(missing).toEqual([]);
  });
});

describe('MDX pipeline', () => {
  it('builds the docs with Fumadocs from src/content/docs', () => {
    const config = fs.readFileSync(path.join(WEB, 'next.config.ts'), 'utf8');
    const sourceConfig = fs.readFileSync(path.join(WEB, 'source.config.ts'), 'utf8');

    expect(config).toContain("from 'fumadocs-mdx/next'");
    expect(sourceConfig).toContain("dir: 'src/content/docs'");
  });
});
