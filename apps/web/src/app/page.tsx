import type { Metadata } from 'next';

import { Developers } from '@/features/landing/components/developers';
import { Features } from '@/features/landing/components/features';
import { FinalCta } from '@/features/landing/components/final-cta';
import { HowItWorks } from '@/features/landing/components/how-it-works';
import { LandingHero } from '@/features/landing/components/landing-hero';
import { LANDING } from '@/features/landing/content';
import { SiteFooter, SiteHeader } from '@/shared/components/site';

export const metadata: Metadata = {
  title: { absolute: LANDING.metadata.title },
  description: LANDING.metadata.description,
  // Canonical lives here, not in the root layout, so other routes never inherit "/".
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: LANDING.name,
    title: LANDING.metadata.title,
    description: LANDING.metadata.description,
  },
};

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:paragraph-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <LandingHero />
        <HowItWorks />
        <Features />
        <Developers />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
