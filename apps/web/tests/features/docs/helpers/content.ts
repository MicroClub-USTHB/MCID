import fs from 'node:fs';
import path from 'node:path';
import { loader } from 'fumadocs-core/source';

/**
 * The docs content read straight from disk, and a Fumadocs source built from it with the same
 * loader options as `src/features/docs/source.ts`. The real source comes from the collection
 * that `fumadocs-mdx` generates at build time, which Vitest cannot load; this one runs the same
 * page tree logic over the same files, so the tests see the sidebar a reader sees.
 */

export const CONTENT_DIR = path.resolve(__dirname, '../../../../src/content/docs');

export interface ContentPage {
  /** Path below the content directory: `build/contributing.mdx`. */
  file: string;
  /** The URL the page is served at: `/docs/build/contributing`, `/docs` for the root index. */
  url: string;
  /** The frontmatter, as written. */
  data: Record<string, string>;
  /** Everything after the frontmatter. */
  body: string;
  /** The whole file. */
  source: string;
}

export interface ContentMeta {
  file: string;
  data: { title?: string; description?: string; pages?: string[] };
}

function filesBelow(dir: string, prefix = ''): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesBelow(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]
    )
    .sort();
}

/**
 * The frontmatter of a page: one `key: value` per line, the value a quoted YAML string (single
 * quotes in the hand-written pages, as Prettier writes them, and double quotes, JSON style, in
 * the generated ones). A small parser is enough; anything else is reported as a parse problem.
 */
export function parseFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const field = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (!field) throw new Error(`unreadable frontmatter line: ${line}`);
    const raw = field[2]!.trim();
    if (raw.startsWith('"')) data[field[1]!] = JSON.parse(raw) as string;
    else if (raw.startsWith("'")) data[field[1]!] = raw.slice(1, -1).replace(/''/g, "'");
    else data[field[1]!] = raw;
  }
  return { data, body: source.slice(match[0].length).replace(/^\n/, '') };
}

const urlOf = (file: string) => {
  const slug = file.replace(/\.mdx$/, '').replace(/(^|\/)index$/, '');
  return slug === '' ? '/docs' : `/docs/${slug}`;
};

export const allFiles = filesBelow(CONTENT_DIR);

export const pages: ContentPage[] = allFiles
  .filter((file) => file.endsWith('.mdx'))
  .map((file) => {
    const source = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    return { file, url: urlOf(file), source, ...parseFrontmatter(source) };
  });

export const metas: ContentMeta[] = allFiles
  .filter((file) => file.endsWith('meta.json'))
  .map((file) => ({
    file,
    data: JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8')) as ContentMeta['data'],
  }));

export const findPage = (url: string) => pages.find((page) => page.url === url) ?? null;

/** A stand-in for a compiled page body, so pages can render without the MDX build. */
export function StubBody() {
  return null;
}

export const testSource = loader({
  baseUrl: '/docs',
  source: {
    files: [
      ...pages.map((page) => ({
        type: 'page' as const,
        path: page.file,
        data: { ...page.data, title: page.data.title ?? '', body: StubBody, toc: [] },
      })),
      ...metas.map((meta) => ({ type: 'meta' as const, path: meta.file, data: meta.data })),
    ],
  },
});
