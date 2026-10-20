'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, FolderKanban, Server, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useAuthStore } from '@/features/auth/stores/auth';
import { McidLogoIcon } from '@/shared/components/brand';
import { useCan } from '@/shared/lib/use-access';

/** The greeting at the top of the dashboard home, on the mcoli-ui hero backdrop. */
function WelcomeCard() {
  const name = useAuthStore((state) => state.user?.name);

  return (
    <section
      aria-labelledby="welcome-heading"
      className="relative isolate overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 shadow-sm md:px-10 md:py-10"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-30 mask-radial dark:opacity-70"
      />
      <div
        aria-hidden="true"
        className="landing-glow absolute -top-40 left-1/2 -z-10 h-80 w-[40rem] max-w-[160%] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
      />
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/70 shadow-sm backdrop-blur">
          <McidLogoIcon size={40} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-sm font-semibold text-primary">Overview</p>
          <h1
            id="welcome-heading"
            className="header-xs font-bold tracking-tight text-balance text-foreground md:header-sm"
          >
            {name ? `Welcome back, ${name}` : 'Welcome back'}
          </h1>
          <p className="max-w-2xl paragraph-sm text-pretty text-muted-foreground md:paragraph-md">
            Micro Club Identity at a glance: the servers it syncs, the projects that sign in through
            it and the members behind them.
          </p>
        </div>
      </div>
    </section>
  );
}

interface QuickLink {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

function QuickLinkCard({ href, title, description, icon: Icon }: QuickLink) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-[border-color,box-shadow,transform] outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-4 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex items-center gap-1.5 paragraph-md font-semibold text-foreground">
          {title}
          <ArrowRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
            aria-hidden="true"
          />
        </span>
        <span className="paragraph-sm text-muted-foreground">{description}</span>
      </Link>
    </li>
  );
}

/** Cards for the main areas the member can open, plus the docs. */
function QuickLinks() {
  const canMembers = useCan('members', 'read');
  const canServers = useCan('servers', 'read');
  const canProjects = useCan('projects', 'read');

  const links: QuickLink[] = [
    ...(canMembers
      ? [
          {
            href: '/dashboard/members',
            title: 'Members',
            description: 'Search the club directory and export it.',
            icon: Users,
          },
        ]
      : []),
    ...(canServers
      ? [
          {
            href: '/dashboard/servers',
            title: 'Servers',
            description: 'The Discord servers MCID syncs and enforces.',
            icon: Server,
          },
        ]
      : []),
    ...(canProjects
      ? [
          {
            href: '/dashboard/projects',
            title: 'Projects',
            description: 'Apps that sign in with MCID and what they reach.',
            icon: FolderKanban,
          },
        ]
      : []),
    {
      href: '/docs',
      title: 'Docs',
      description: 'Guides and the API reference for building on MCID.',
      icon: BookOpen,
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {links.map((link) => (
        <QuickLinkCard key={link.href} {...link} />
      ))}
    </ul>
  );
}

export { QuickLinks, WelcomeCard };
