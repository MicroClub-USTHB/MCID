import type * as React from 'react';
import Link from 'next/link';

import { McidLogo, McidLogoIcon } from '@/shared/components/brand';
import { ModeToggle } from '@/shared/components/common/ModeToggle';
import { McCard } from '@/shared/components/ui/mc-card';
import { cn } from '@/shared/lib/utils';

/**
 * The frame of the sign-in and callback screens: a slim bar with the logo and the light/dark
 * switch, the grid and glow backdrop of the public site, and one centred card. The full site
 * header is left out on purpose: its "Admin sign in" button points at this very page, and its
 * docs links pull the visitor away from the one task here.
 */
export function AuthShell({ children, className, ...props }: React.ComponentProps<typeof McCard>) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-30 mask-radial dark:opacity-70"
      />
      <div
        aria-hidden="true"
        className="landing-glow absolute top-[-12rem] left-1/2 -z-10 h-[30rem] w-[48rem] max-w-[140vw] rounded-full bg-primary/20 blur-[120px]"
      />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          aria-label="MCID home"
          className="rounded-md transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <McidLogo height={26} />
        </Link>
        <ModeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-20">
        <McCard
          className={cn(
            'w-full max-w-sm gap-0 rounded-2xl bg-card/90 p-8 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl',
            className
          )}
          {...props}
        >
          {children}
        </McCard>
      </main>
    </div>
  );
}

/** The fingerprint mark in a soft primary tile, at the top of each auth card. */
export function AuthMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm',
        className
      )}
    >
      <McidLogoIcon size={32} />
    </span>
  );
}
