import type { LucideIcon } from 'lucide-react';
import { Fingerprint, History, Layers, ShieldCheck, SquareTerminal, Webhook } from 'lucide-react';

import { Reveal, SectionHeader } from '@/features/landing/components/primitives';
import { LANDING, type LandingFeatureIcon } from '@/features/landing/content';
import { cn } from '@/shared/lib/utils';

const { features } = LANDING;

const ICONS: Record<LandingFeatureIcon, LucideIcon> = {
  sso: Fingerprint,
  roles: Layers,
  admin: ShieldCheck,
  webhooks: Webhook,
  cli: SquareTerminal,
  audit: History,
};

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="landing-deferred py-20 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeader
          id="features-title"
          eyebrow={features.eyebrow}
          title={features.title}
          description={features.description}
        />

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={item.title}>
                <Reveal
                  delay={(i % 3) * 80}
                  className={cn(
                    'group/tile relative isolate flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-xl',
                    'dark:shadow-[inset_0_-24px_80px_-24px_rgb(255_255_255/0.07)]'
                  )}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(420px_circle_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover/tile:opacity-100"
                  />
                  <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-xs">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="space-y-1.5">
                    <h3 className="font-heading text-lg font-bold text-card-foreground">
                      {item.title}
                    </h3>
                    <p className="paragraph-sm text-pretty text-muted-foreground">{item.body}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
