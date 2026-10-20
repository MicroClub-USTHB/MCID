import { defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';

/**
 * The docs collection: every `.mdx` page and `meta.json` folder file under `src/content/docs`.
 * A page must have a title and a description: the description is the meta description and the
 * text under the title.
 */
export const docs = defineDocs({
  dir: 'src/content/docs',
  docs: {
    schema: frontmatterSchema.extend({ description: z.string().min(1) }),
  },
});

export default defineConfig();
