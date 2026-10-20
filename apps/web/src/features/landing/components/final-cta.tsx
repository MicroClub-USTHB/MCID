import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Reveal } from '@/features/landing/components/primitives';
import { LANDING } from '@/features/landing/content';
import { GithubIcon } from '@/shared/components/brand';
import { REPO_URL } from '@/shared/components/site';
import { buttonVariants } from '@/shared/components/ui/mc-button-variants';
import { cn } from '@/shared/lib/utils';

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className="landing-deferred relative isolate overflow-hidden border-t border-border"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-grid opacity-25 mask-radial dark:opacity-50"
      />

      <Reveal className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center md:py-28">
        <h2
          id="final-cta-title"
          className="header-sm font-extrabold text-balance text-foreground md:header-lg"
        >
          {LANDING.finalCta.title}
        </h2>
        <p className="mt-5 max-w-xl paragraph-md text-pretty text-muted-foreground md:paragraph-lg">
          {LANDING.finalCta.description}
        </p>
        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href={LANDING.docs.href}
            className={cn(
              buttonVariants({ variant: 'primary', size: 'lg' }),
              'w-full gap-2 shadow-lg shadow-primary/20 sm:w-auto'
            )}
          >
            {LANDING.docs.label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'lg' }),
              'w-full gap-2 sm:w-auto'
            )}
          >
            <GithubIcon />
            View on GitHub
          </a>
        </div>
      </Reveal>
    </section>
  );
}
