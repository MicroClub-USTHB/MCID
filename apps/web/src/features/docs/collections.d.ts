/**
 * Types of the docs collection that `fumadocs-mdx` writes to `.source/server.ts` when `next dev`
 * or `next build` loads next.config.ts (which aliases this import to that file). Declared here so
 * `tsc` passes in a fresh clone, before anything has generated `.source/`. Keep the frontmatter in
 * step with the schema in source.config.ts.
 */
declare module 'fumadocs-mdx:collections/server' {
  import type { DocsCollectionEntry } from 'fumadocs-mdx/runtime/server';

  export const docs: DocsCollectionEntry<
    'docs',
    { title: string; description: string; icon?: string; full?: boolean }
  >;
}
