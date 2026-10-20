import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

// Compiles the docs collection of source.config.ts and writes its index to `.source/`
// (ignored by git) whenever `next dev` or `next build` loads this file.
const withMDX = createMDX();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    // The generated collection; its types live in src/features/docs/collections.d.ts.
    resolveAlias: { 'fumadocs-mdx:collections/server': './.source/server.ts' },
  },
};

export default withMDX(nextConfig);
