import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';

import { AppPreview } from '@/features/landing/components/app-preview';
import { CommandLine } from '@/features/landing/components/command-line';
import { LANDING } from '@/features/landing/content';
import { buttonVariants } from '@/shared/components/ui/mc-button-variants';
import { cn } from '@/shared/lib/utils';

export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-30 mask-radial dark:opacity-80"
      />
      <div
        aria-hidden="true"
        className="landing-glow absolute top-[-14rem] left-1/2 -z-10 h-[34rem] w-[56rem] max-w-[140vw] rounded-full bg-primary/25 blur-[120px]"
      />

      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 text-center sm:pt-32 md:px-6">
        <h1
          id="hero-title"
          className="max-w-4xl font-heading text-[2.6rem] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance text-foreground sm:header-lg md:header-xl md:leading-[1.05]"
        >
          {LANDING.headlineLead}
          <span className="text-gradient-primary">{LANDING.headlineAccent}</span>
        </h1>

        <p className="mt-6 max-w-2xl paragraph-lg text-pretty text-muted-foreground md:paragraph-xl">
          {LANDING.subtext}
        </p>

        <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
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
          <Link
            href={LANDING.signIn.href}
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'lg' }),
              'w-full gap-2 sm:w-auto'
            )}
          >
            <LogIn className="size-4" aria-hidden="true" />
            {LANDING.signIn.label}
          </Link>
        </div>

        <CommandLine className="mt-10 max-w-xl" />

        <ul
          aria-label="Highlights"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground"
        >
          {LANDING.stack.map((item, i) => (
            <li key={item} className="flex items-center gap-5">
              {i > 0 ? <span className="size-1 rounded-full bg-border" aria-hidden="true" /> : null}
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-16 px-4 md:mt-20 md:px-6">
        <div className="max-h-[520px] overflow-hidden mask-fade-b sm:max-h-[680px]">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
