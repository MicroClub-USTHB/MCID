import type * as React from 'react';
import Link from 'next/link';

import { GithubIcon, McidLogo } from '@/shared/components/brand';
import { ModeToggle } from '@/shared/components/common/ModeToggle';
import { buttonVariants } from '@/shared/components/ui/mc-button-variants';
import { REPO_URL } from '@/shared/components/site/links';
import { cn } from '@/shared/lib/utils';

const NAV = [
  { label: 'Docs', href: '/docs' },
  { label: 'API reference', href: '/docs/api-reference' },
];

export interface SiteHeaderProps extends React.ComponentProps<'header'> {
  /** The docs search button; the landing passes nothing. */
  search?: React.ReactNode;
  /** Extra mobile-only control (the docs pass their sidebar trigger). */
  mobileTrigger?: React.ReactNode;
  /** Max width of the bar's content, so it lines up with the page below. */
  contentClassName?: string;
}

/**
 * The public top bar shared by the landing page, the login page and the docs. Built like the
 * mcoli-ui site header: logo, links, GitHub, the light/dark switch and the sign-in action.
 */
export function SiteHeader({
  search,
  mobileTrigger,
  contentClassName,
  className,
  ...props
}: SiteHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-6',
          contentClassName
        )}
      >
        <Link
          href="/"
          aria-label="MCID home"
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          <McidLogo height={26} />
        </Link>

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1 md:gap-2">
          {search}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MCID on GitHub"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <GithubIcon />
          </a>
          <span className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden="true" />
          <ModeToggle />
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'primary', size: 'sm' }),
              'ms-1 hidden sm:inline-flex'
            )}
          >
            Admin sign in
          </Link>
          {mobileTrigger}
        </div>
      </div>
    </header>
  );
}
