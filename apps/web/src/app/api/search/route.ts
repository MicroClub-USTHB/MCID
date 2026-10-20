import { createFromSource } from 'fumadocs-core/search/server';

import { source } from '@/features/docs/source';

// Backs the Fumadocs search dialog, which queries /api/search. Built at build time from the docs.
export const { GET } = createFromSource(source, { language: 'english' });
