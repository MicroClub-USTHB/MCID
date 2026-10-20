import type * as React from 'react';
import type { Metadata } from 'next';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { RootProvider } from 'fumadocs-ui/provider/next';

import { DocsHeader } from '@/features/docs/components/docs-header';
import { ThemeControls } from '@/features/docs/components/theme-controls';
import { source } from '@/features/docs/source';
import { McidLogo } from '@/shared/components/brand';
import { REPO_URL } from '@/shared/components/site';

export const metadata: Metadata = {
  title: { default: 'MCID Docs', template: '%s | MCID Docs' },
  description:
    'Developer documentation for MCID, the Micro Club identity platform: how to use it from your project and how to work on it.',
};

/**
 * The Fumadocs Notebook layout, as on the mcoli-ui site. The provider is mounted here only, so
 * the rest of the app never loads it, and its theme handling (next-themes) is off: the app's
 * own `.dark` class drives both. The header is the shared SiteHeader (see DocsHeader).
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RootProvider theme={{ enabled: false }} search={{ preload: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{ title: <McidLogo height={24} />, url: '/', mode: 'top' }}
        githubUrl={REPO_URL}
        slots={{ header: DocsHeader, themeSwitch: ThemeControls }}
        containerProps={{
          className: 'docs-backdrop',
          // Matches the h-16 SiteHeader so the sticky sidebar and TOC sit right below it.
          style: { '--fd-header-height': '4rem' } as React.CSSProperties,
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
