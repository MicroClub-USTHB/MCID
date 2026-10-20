import { docs } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';

/** The docs pages and their page tree, from `src/content/docs` (see `source.config.ts`). */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
