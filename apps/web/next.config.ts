import path from 'node:path';
import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

// Compiles the docs collection of source.config.ts and writes its index to `.source/`
// (ignored by git) whenever `next dev` or `next build` loads this file.
const withMDX = createMDX();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server in .next/standalone for the Docker image (apps/web/Dockerfile).
  output: 'standalone',
  // Trace from the monorepo root so workspace packages and pnpm's hoisted store are included.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  reactStrictMode: true,
  turbopack: {
    // The generated collection; its types live in src/features/docs/collections.d.ts.
    resolveAlias: { 'fumadocs-mdx:collections/server': './.source/server.ts' },
  },
};

export default withMDX(nextConfig);
