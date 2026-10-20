import type { MetadataRoute } from 'next';

import { source } from '@/features/docs/source';
import { env } from '@/shared/lib/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return [{ url: `${base}/` }, ...source.getPages().map((page) => ({ url: `${base}${page.url}` }))];
}
